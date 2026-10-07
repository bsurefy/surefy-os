// SPDX-License-Identifier: AGPL-3.0-only
import { orgScope, versionedKey, type Cache } from '@/core/cache/index.js'
import { TeamNotFoundError } from '@/modules/teams/index.js'
import {
  AUDIT_ACTIONS,
  ROLE_PERMISSIONS,
  roleAtLeast,
  type AccessPolicy,
  type AccessPolicyDto,
  type Feature,
  type MemberEffectiveAccessDto,
  type TeamEffectiveAccessDto,
} from '@surefy/contracts'

import { EFFECTIVE_ACCESS_TTL_SECONDS } from './access.constants.js'
import {
  AccessExceedsParentError,
  AccessMemberNotFoundError,
  OrganizationSuspendedError,
  TwoFactorRequiredError,
} from './access.errors.js'
import { toAccessPolicyDto } from './access.mapper.js'
import {
  entitlementLevel,
  exceedsParent,
  filterPermissions,
  narrow,
  policyChanges,
  unionAcrossTeams,
  type AccessLevel,
} from './access.utils.js'

import type { AccessPolicyRow, AccessRepository, MemberForAccess } from './access.repository.js'
import type {
  AccessContext,
  AccessModels,
  AccessOrganizations,
  AccessTeams,
  AccessUsers,
  ProviderRules,
} from './access.types.js'
import type { EntitlementGrant, EntitlementSource } from './entitlements.types.js'
import type { Database, DbExecutor } from '@/core/database/index.js'
import type { ExtensionRegistry } from '@/core/extensions/index.js'
import type { AuditContext, AuditRecorder } from '@/modules/audit/index.js'
import type { TenantAccessResolver } from '@/plugins/access.plugin.js'
import type { ActorContext, EffectiveAccess } from '@/types/context.js'

export interface AccessServiceDeps {
  db: Database
  cache: Cache
  accessRepository: AccessRepository
  /** The active entitlement source (Community, license or plans), read at call time. */
  entitlements: EntitlementSource
  /** Per-request organization checks contributed by extensions. */
  hooks: Pick<ExtensionRegistry, 'accessChecks'>
  organizations: AccessOrganizations
  teams: AccessTeams
  users: AccessUsers
  models: AccessModels
  audit: AuditRecorder
}

/** Everything one computation needs, read in one tenant transaction. */
interface AccessInputs {
  member: MemberForAccess
  policies: AccessPolicyRow[]
}

const policyOf = (rows: readonly AccessPolicyRow[], teamId: string | null) =>
  rows.find((row) => row.teamId === teamId)?.policy

/**
 * Effective access (authorization.md, §4–5; access-and-entitlements.md, "Effective access"):
 * entitlement source → organization policy → team policies → role, cached under the
 * organization's access version and never stored. Also the `TenantAccessResolver` of
 * `app.authorize()`, where the organization's own rules apply on top.
 */
export class AccessService implements TenantAccessResolver {
  constructor(private readonly deps: AccessServiceDeps) {}

  /**
   * The guard path: null (404) without an active membership; the organization's rules may throw
   * (suspended, two-factor required); while deletion is scheduled only Owners and Admins keep
   * access; then every extension access check runs.
   */
  async resolve(actor: ActorContext, orgId: string): Promise<EffectiveAccess | null> {
    const { userId } = actor
    if (userId === null) return null // API keys (V1) and access grants arrive with their resolvers
    const header = await this.deps.db.tenant(orgId, (tx) =>
      this.deps.organizations.findAccessHeaderInTx(tx, orgId),
    )
    if (header === undefined) return null
    const access = await this.cached(orgId, userId, header.accessVersion)
    if (access === null) return null
    if (header.status === 'suspended') throw new OrganizationSuspendedError()
    if (header.status === 'deletion_scheduled' && !roleAtLeast(access.role ?? 'user', 'admin')) {
      return null
    }
    if (header.require2fa && (await this.deps.users.findById(userId))?.twoFactorEnabled !== true) {
      throw new TwoFactorRequiredError()
    }
    for (const check of this.deps.hooks.accessChecks()) await check.check({ actor, orgId, access })
    return access
  }

  /**
   * A member's current effective access, for work that re-checks it later (an export being
   * prepared): null without an active membership or in a suspended organization.
   */
  async forMember(orgId: string, userId: string): Promise<EffectiveAccess | null> {
    const header = await this.deps.db.tenant(orgId, (tx) =>
      this.deps.organizations.findAccessHeaderInTx(tx, orgId),
    )
    if (header === undefined || header.status === 'suspended') return null
    return this.cached(orgId, userId, header.accessVersion)
  }

  /**
   * Whether the organization (and, for a person, their teams) has a feature. Core code offers
   * hooks for private logic with it, never edition checks.
   */
  async hasFeature(ctx: AccessContext, feature: Feature): Promise<boolean> {
    if (ctx.userId !== null) {
      const header = await this.deps.db.tenant(ctx.orgId, (tx) =>
        this.deps.organizations.findAccessHeaderInTx(tx, ctx.orgId),
      )
      if (header === undefined) return false
      const access = await this.cached(ctx.orgId, ctx.userId, header.accessVersion)
      return access?.features.includes(feature) ?? false
    }
    const grant = await this.deps.entitlements.getEntitlements({ orgId: ctx.orgId })
    const organization = await this.deps.db.tenant(ctx.orgId, (tx) =>
      this.deps.accessRepository.find(tx, ctx.orgId, null),
    )
    const level = this.organizationLevel(grant, organization?.policy)
    return !grant.readOnly && level.features.includes(feature)
  }

  /** `GET …/access/members/:userId`: a member's effective access, with names for the view. */
  async getMember(ctx: AccessContext, userId: string): Promise<MemberEffectiveAccessDto> {
    const grant = await this.deps.entitlements.getEntitlements({ orgId: ctx.orgId })
    const result = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const inputs = await this.loadInputs(tx, ctx.orgId, userId)
      if (inputs === null) return null
      return {
        access: await this.computeInTx(tx, ctx.orgId, userId, inputs, grant),
        teams: await this.deps.teams.findRefsInTx(tx, ctx.orgId, inputs.member.teamIds),
      }
    })
    const user = (await this.deps.users.findUserRefs([userId])).get(userId)
    if (result === null || user === undefined) throw new AccessMemberNotFoundError()
    return { ...result.access, user, teams: result.teams }
  }

  /** `GET …/access/teams/:teamId`: the team level, before any role filter. */
  async getTeam(ctx: AccessContext, teamId: string): Promise<TeamEffectiveAccessDto> {
    const grant = await this.deps.entitlements.getEntitlements({ orgId: ctx.orgId })
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const team = await this.findTeamOrThrow(tx, ctx.orgId, teamId)
      const rows = await this.deps.accessRepository.listForOrgAndTeams(tx, ctx.orgId, [teamId])
      const organization = this.organizationLevel(grant, policyOf(rows, null))
      const level = narrow(organization, policyOf(rows, teamId), { source: 'team', teamId })
      return {
        team,
        modules: level.modules,
        features: grant.readOnly ? [] : level.features,
        allowedModelIds: await this.deps.models.allowedFor(tx, {
          orgId: ctx.orgId,
          userId: null,
          teamIds: [teamId],
          providersAllowed: level.providersAllowed,
          localModels: level.providerFlags.localModels,
        }),
        limits: level.limits,
        reasons: level.reasons,
      }
    })
  }

  /**
   * The provider rules for a person (across their teams), a team, or the organization level:
   * which providers, personal keys and local servers the vault and the gateway allow.
   */
  async providerRules(
    orgId: string,
    subject: { userId: string } | { teamId: string } | null,
  ): Promise<ProviderRules> {
    const grant = await this.deps.entitlements.getEntitlements({ orgId })
    return this.deps.db.tenant(orgId, async (tx) => {
      const teamIds = await this.subjectTeamIds(tx, orgId, subject)
      const policies = await this.deps.accessRepository.listForOrgAndTeams(tx, orgId, teamIds)
      const organization = this.organizationLevel(grant, policyOf(policies, null))
      const level = unionAcrossTeams(
        organization,
        teamIds.map((teamId) =>
          narrow(organization, policyOf(policies, teamId), { source: 'team', teamId }),
        ),
      )
      return {
        providersAllowed: level.providersAllowed,
        personalKeys: level.providerFlags.personalKeys,
        localModels: level.providerFlags.localModels,
      }
    })
  }

  private async subjectTeamIds(
    tx: DbExecutor,
    orgId: string,
    subject: { userId: string } | { teamId: string } | null,
  ): Promise<string[]> {
    if (subject === null) return []
    if ('teamId' in subject) return [subject.teamId]
    const member = await this.deps.accessRepository.findMemberForAccess(tx, orgId, subject.userId)
    return member?.teamIds ?? []
  }

  /** The organization's (`teamId` null) or a team's own restrictions. */
  async getPolicy(ctx: AccessContext, teamId: string | null): Promise<AccessPolicyDto> {
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      if (teamId !== null) await this.findTeamOrThrow(tx, ctx.orgId, teamId)
      return toAccessPolicyDto(teamId, await this.deps.accessRepository.find(tx, ctx.orgId, teamId))
    })
  }

  /**
   * Replaces a level's restrictions after checking them against the parent level (the
   * entitlement source for the organization row, the organization's level for a team row);
   * audited with the diff and bumping the access version in the same transaction.
   */
  async updatePolicy(
    ctx: AuditContext,
    teamId: string | null,
    policy: AccessPolicy,
  ): Promise<AccessPolicyDto> {
    const grant = await this.deps.entitlements.getEntitlements({ orgId: ctx.orgId })
    const repository = this.deps.accessRepository
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      if (teamId !== null) await this.findTeamOrThrow(tx, ctx.orgId, teamId)
      const top = entitlementLevel(grant, this.deps.entitlements.name)
      const rows = await repository.listForOrgAndTeams(
        tx,
        ctx.orgId,
        teamId === null ? [] : [teamId],
      )
      const parent =
        teamId === null ? top : narrow(top, policyOf(rows, null), { source: 'organization' })
      const details = exceedsParent(
        parent,
        policy,
        teamId === null ? this.deps.entitlements.name : 'organization',
      )
      if (details.length > 0) throw new AccessExceedsParentError(details)
      const before = policyOf(rows, teamId) ?? { version: 1 }
      const row = await repository.upsert(tx, {
        organizationId: ctx.orgId,
        teamId,
        policy,
        userId: ctx.userId,
      })
      await this.deps.organizations.bumpAccessVersionInTx(tx, ctx.orgId)
      await this.deps.audit.record(tx, ctx, {
        action: AUDIT_ACTIONS.ACCESS_POLICY_UPDATED,
        target: { type: 'access_policy', id: row.id },
        metadata: {
          changes: policyChanges(before, policy),
          ...(teamId === null ? {} : { refs: { teamId } }),
        },
      })
      return toAccessPolicyDto(teamId, row)
    })
  }

  // ---- Private ------------------------------------------------------------------------------

  private cached(orgId: string, userId: string, accessVersion: number) {
    return this.deps.cache.wrap(
      versionedKey(orgScope(orgId), accessVersion, 'access', userId),
      EFFECTIVE_ACCESS_TTL_SECONDS,
      () => this.compute(orgId, userId),
    )
  }

  private async compute(orgId: string, userId: string): Promise<EffectiveAccess | null> {
    const grant = await this.deps.entitlements.getEntitlements({ orgId })
    return this.deps.db.tenant(orgId, async (tx) => {
      const inputs = await this.loadInputs(tx, orgId, userId)
      return inputs === null ? null : this.computeInTx(tx, orgId, userId, inputs, grant)
    })
  }

  private async loadInputs(
    tx: DbExecutor,
    orgId: string,
    userId: string,
  ): Promise<AccessInputs | null> {
    const member = await this.deps.accessRepository.findMemberForAccess(tx, orgId, userId)
    if (member?.status !== 'active') return null
    const policies = await this.deps.accessRepository.listForOrgAndTeams(tx, orgId, member.teamIds)
    return { member, policies }
  }

  private async computeInTx(
    tx: DbExecutor,
    orgId: string,
    userId: string,
    { member, policies }: AccessInputs,
    grant: EntitlementGrant,
  ): Promise<EffectiveAccess> {
    const organization = this.organizationLevel(grant, policyOf(policies, null))
    const level = unionAcrossTeams(
      organization,
      member.teamIds.map((teamId) =>
        narrow(organization, policyOf(policies, teamId), { source: 'team', teamId }),
      ),
    )
    // During a license's grace days every feature is read-only: visible, not editable.
    const features = grant.readOnly ? [] : level.features
    const readOnlyFeatures = grant.readOnly ? level.features : []
    return {
      role: member.role,
      teamIds: member.teamIds,
      primaryTeamId: member.primaryTeamId,
      permissions: filterPermissions(ROLE_PERMISSIONS[member.role], level.modules, level.features),
      modules: level.modules,
      features,
      readOnlyFeatures,
      license: grant.license,
      allowedModelIds: await this.deps.models.allowedFor(tx, {
        orgId,
        userId,
        teamIds: member.teamIds,
        providersAllowed: level.providersAllowed,
        localModels: level.providerFlags.localModels,
      }),
      limits: level.limits,
      reasons: level.reasons,
    }
  }

  private organizationLevel(
    grant: EntitlementGrant,
    policy: AccessPolicy | undefined,
  ): AccessLevel {
    return narrow(entitlementLevel(grant, this.deps.entitlements.name), policy, {
      source: 'organization',
    })
  }

  private async findTeamOrThrow(tx: DbExecutor, orgId: string, teamId: string) {
    const [team] = await this.deps.teams.findRefsInTx(tx, orgId, [teamId])
    if (team === undefined) throw new TeamNotFoundError()
    return team
  }
}
