// SPDX-License-Identifier: AGPL-3.0-only
import { createHash, randomBytes } from 'node:crypto'

import { UnauthorizedError } from '@/core/errors/index.js'
import { decodeCursor, toPage } from '@/lib/pagination.js'
import { TeamNotFoundError } from '@/modules/teams/index.js'
import {
  AUDIT_ACTIONS,
  PERMISSIONS,
  type AcceptInvitationResultDto,
  type CreateInvitationInput,
  type InvitationDto,
  type InvitationLinkDto,
  type InvitationPreviewDto,
  type InvitationStatus,
  type ListInvitationsQuery,
  type OrganizationDto,
  type TeamRefDto,
} from '@surefy/contracts'

import { INVITE_PATH } from '../members.constants.js'
import {
  AlreadyInvitedError,
  AlreadyMemberError,
  InvitationAlreadyAcceptedError,
  InvitationEmailMismatchError,
  InvitationExpiredError,
  InvitationNotFoundError,
  InvitationRevokedError,
  OwnerRoleRestrictedError,
} from '../members.errors.js'

import type {
  InvitationRow,
  MemberInvitationsRepository,
  PendingInvitationForEmail,
} from './memberInvitations.repository.js'
import type {
  MemberNotifications,
  MemberOrganizations,
  MembersContext,
  MemberTeams,
  MemberUsers,
} from '../members.types.js'
import type { MembershipsRepository } from '../memberships/memberships.repository.js'
import type { MembershipsService } from '../memberships/memberships.service.js'
import type { Config } from '@/core/config/index.js'
import type { Database, DbExecutor } from '@/core/database/index.js'
import type { AuditRecorder } from '@/modules/audit/index.js'
import type { EmailDeliveryListener } from '@/modules/notifications/index.js'
import type { ActorContext } from '@/types/context.js'

export interface MemberInvitationsServiceDeps {
  config: Config
  db: Database
  invitationsRepository: MemberInvitationsRepository
  membershipsRepository: MembershipsRepository
  memberships: MembershipsService
  organizations: MemberOrganizations
  teams: MemberTeams
  users: MemberUsers
  notifications: MemberNotifications
  audit: AuditRecorder
}

/** Which invitation email job reported, and how it ended. */
export interface InvitationDeliveryOutcome {
  orgId: string
  invitationId: string
  status: 'sent' | 'failed'
}

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const TOKEN_LENGTH = 43

/** 256 random bits as 43 base62 characters (token hashing, conventions-and-security.md §12). */
const newToken = (): string => {
  let value = BigInt(`0x${randomBytes(32).toString('hex')}`)
  let token = ''
  while (value > 0n) {
    token = BASE62.charAt(Number(value % 62n)) + token
    value /= 62n
  }
  return token.padStart(TOKEN_LENGTH, '0')
}

const hashToken = (token: string): Buffer => createHash('sha256').update(token).digest()

/** Expiry is computed: a pending invitation past `expires_at` reads as expired. */
const effectiveStatus = (row: { status: InvitationStatus; expiresAt: Date }): InvitationStatus =>
  row.status === 'pending' && row.expiresAt.getTime() <= Date.now() ? 'expired' : row.status

/** The error an invitation that can no longer be used answers with. */
const unusable = (status: InvitationStatus): Error | undefined => {
  if (status === 'accepted') return new InvitationAlreadyAcceptedError()
  if (status === 'revoked') return new InvitationRevokedError()
  if (status === 'expired') return new InvitationExpiredError()
  return undefined
}

/**
 * Invitations (organizations-and-members.md, §4–5): create, list, resend, copy the link, revoke,
 * the public link preview, acceptance, and the email's delivery status. The raw token exists only
 * in the link: the database holds its sha256, and only the email job payload carries the link.
 */
export class MemberInvitationsService {
  constructor(private readonly deps: MemberInvitationsServiceDeps) {}

  async list(
    ctx: MembersContext,
    query: ListInvitationsQuery,
  ): Promise<{ items: InvitationDto[]; nextCursor: string | null }> {
    const { items, nextCursor, teams } = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const rows = await this.deps.invitationsRepository.listPage(tx, ctx.orgId, {
        limit: query.limit,
        statuses: query.status ?? ['pending'],
        ...(query.q === undefined ? {} : { q: query.q }),
        ...(query.cursor === undefined ? {} : { cursor: decodeCursor(query.cursor) }),
      })
      const page = toPage(rows, query.limit, (row) => ({ k: row.sortKey, id: row.invitation.id }))
      const invitations = page.items.map((row) => row.invitation)
      return { ...page, items: invitations, teams: await this.teamsOf(tx, ctx.orgId, invitations) }
    })
    return { items: await this.toDtos(items, teams), nextCursor }
  }

  /**
   * One address per request. Only Owners invite Owners; an existing member or a pending,
   * unexpired invitation is refused. The email is queued after the commit.
   */
  async create(ctx: MembersContext, input: CreateInvitationInput): Promise<InvitationDto> {
    if (
      input.role === 'owner' &&
      !ctx.access.permissions.includes(PERMISSIONS.MEMBERS_MANAGE_ADMINS)
    ) {
      throw new OwnerRoleRestrictedError()
    }
    const teamIds = [...new Set(input.teamIds)]
    const token = newToken()
    const repository = this.deps.invitationsRepository
    const { row, teams, organization } = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      if (await this.deps.membershipsRepository.findByEmail(tx, ctx.orgId, input.email)) {
        throw new AlreadyMemberError()
      }
      const pending = await repository.findPendingByEmail(tx, ctx.orgId, input.email)
      if (pending !== undefined) {
        if (effectiveStatus(pending) === 'pending') throw new AlreadyInvitedError()
        await repository.markExpired(tx, ctx.orgId, pending.id)
      }
      const refs = await this.deps.teams.findRefsInTx(tx, ctx.orgId, teamIds)
      if (refs.length !== teamIds.length) throw new TeamNotFoundError()
      const invitation = await repository.insert(tx, {
        organizationId: ctx.orgId,
        email: input.email,
        role: input.role,
        tokenHash: hashToken(token),
        invitedByUserId: ctx.userId,
        sendCount: 1,
      })
      await repository.insertTeams(tx, ctx.orgId, invitation.id, teamIds)
      await this.deps.audit.record(tx, ctx, {
        action: AUDIT_ACTIONS.MEMBER_INVITED,
        target: { type: 'invitation', id: invitation.id },
        metadata: { labels: { role: input.role }, counts: { teams: teamIds.length } },
      })
      return {
        row: invitation,
        teams: new Map([[invitation.id, refs]]),
        organization: await this.organizationOrThrow(tx, ctx.orgId),
      }
    })
    await this.queueEmail(row, token, organization)
    return this.toDto(row, teams)
  }

  /** A new link by email: the previous link stops working, the expiry starts again. */
  async resend(ctx: MembersContext, invitationId: string): Promise<InvitationDto> {
    const token = newToken()
    const { row, teams, organization } = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const rotated = await this.rotateInTx(tx, ctx.orgId, invitationId, token, { resend: true })
      await this.deps.audit.record(tx, ctx, {
        action: AUDIT_ACTIONS.INVITATION_RESENT,
        target: { type: 'invitation', id: rotated.id },
      })
      return {
        row: rotated,
        teams: await this.teamsOf(tx, ctx.orgId, [rotated]),
        organization: await this.organizationOrThrow(tx, ctx.orgId),
      }
    })
    await this.queueEmail(row, token, organization)
    return this.toDto(row, teams)
  }

  /** "Copy invite link" (also the path without an email server): shown once, never stored. */
  async link(ctx: MembersContext, invitationId: string): Promise<InvitationLinkDto> {
    const token = newToken()
    const row = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const rotated = await this.rotateInTx(tx, ctx.orgId, invitationId, token, { resend: false })
      await this.deps.audit.record(tx, ctx, {
        action: AUDIT_ACTIONS.INVITATION_LINK_COPIED,
        target: { type: 'invitation', id: rotated.id },
      })
      return rotated
    })
    return { url: this.urlOf(token), expiresAt: row.expiresAt.toISOString() }
  }

  async revoke(ctx: MembersContext, invitationId: string): Promise<InvitationDto> {
    const repository = this.deps.invitationsRepository
    const { row, teams } = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const current = await repository.findById(tx, ctx.orgId, invitationId)
      if (current === undefined) throw new InvitationNotFoundError()
      if (
        current.role === 'owner' &&
        !ctx.access.permissions.includes(PERMISSIONS.MEMBERS_MANAGE_ADMINS)
      ) {
        throw new OwnerRoleRestrictedError()
      }
      const error = current.status === 'pending' ? undefined : unusable(current.status)
      if (error !== undefined) throw error
      const revoked = (await repository.revoke(tx, ctx.orgId, invitationId, ctx.userId)) ?? current
      await this.deps.audit.record(tx, ctx, {
        action: AUDIT_ACTIONS.INVITATION_REVOKED,
        target: { type: 'invitation', id: current.id },
      })
      return { row: revoked, teams: await this.teamsOf(tx, ctx.orgId, [revoked]) }
    })
    return this.toDto(row, teams)
  }

  /** The accept screen before sign-in: what the link is for and whether it still works. */
  async preview(token: string): Promise<InvitationPreviewDto> {
    const resolved = await this.resolveOrThrow(token)
    const organization = await this.deps.db.tenant(resolved.organizationId, (tx) =>
      this.deps.organizations.getInTx(tx, resolved.organizationId),
    )
    if (organization === undefined) throw new InvitationNotFoundError()
    return {
      organization: {
        name: organization.name,
        slug: organization.slug,
        logoUrl: organization.logoUrl,
      },
      role: resolved.role,
      email: resolved.email,
      inviterName: resolved.invitedByName,
      status: effectiveStatus(resolved),
      expiresAt: resolved.expiresAt.toISOString(),
      requiresTwoFactor: organization.settings.security.require2fa,
    }
  }

  /**
   * Joins the organization as the invited person: their verified email must match. One
   * transaction marks the invitation accepted, creates the membership, adds the invitation's
   * teams (the first becomes the primary team) and bumps the access version.
   */
  async accept(actor: ActorContext | null, token: string): Promise<AcceptInvitationResultDto> {
    if (actor?.userId == null) throw new UnauthorizedError()
    const userId = actor.userId
    const resolved = await this.resolveOrThrow(token)
    const error = unusable(effectiveStatus(resolved))
    if (error !== undefined) throw error
    const user = await this.deps.users.findById(userId)
    if (user?.emailVerified !== true || user.email !== resolved.email) {
      throw new InvitationEmailMismatchError()
    }
    const orgId = resolved.organizationId
    return this.deps.db.tenant(orgId, async (tx) => {
      if (await this.deps.memberships.findByUserInTx(tx, orgId, userId)) {
        throw new AlreadyMemberError()
      }
      const invitation = await this.deps.invitationsRepository.accept(
        tx,
        orgId,
        resolved.invitationId,
        userId,
      )
      if (invitation === undefined) throw new InvitationExpiredError()
      const membership = await this.deps.memberships.insertInTx(tx, {
        orgId,
        userId,
        role: invitation.role,
        provisioningSource: 'invitation',
        invitedByUserId: invitation.invitedByUserId,
      })
      const teamIds = await this.deps.invitationsRepository.listTeamIds(tx, orgId, [invitation.id])
      await this.deps.teams.addMemberToTeamsInTx(
        tx,
        orgId,
        userId,
        teamIds.map((row) => row.teamId),
        invitation.invitedByUserId,
      )
      await this.deps.organizations.bumpAccessVersionInTx(tx, orgId)
      await this.deps.audit.record(
        tx,
        { ...actor, orgId },
        {
          action: AUDIT_ACTIONS.MEMBER_JOINED,
          target: { type: 'member', id: membership.id },
          metadata: { refs: { invitationId: invitation.id }, labels: { role: invitation.role } },
        },
      )
      const organization = await this.organizationOrThrow(tx, orgId)
      return {
        organization: {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          logoUrl: organization.logoUrl,
          status: organization.status,
        },
        memberId: membership.id,
      }
    })
  }

  /**
   * "Ask {inviter} for a new invite" from an expired or revoked link: notifies the inviter while
   * they are still an active member. Answers the same whatever happened, so the link reveals
   * nothing more.
   */
  async requestReissue(token: string): Promise<void> {
    const resolved = await this.deps.invitationsRepository.resolveToken(
      this.deps.db.global,
      hashToken(token),
    )
    if (resolved === undefined) return
    const status = effectiveStatus(resolved)
    if (status !== 'expired' && status !== 'revoked') return
    const orgId = resolved.organizationId
    const inviter = await this.deps.db.tenant(orgId, async (tx) => {
      const row = await this.deps.invitationsRepository.findById(tx, orgId, resolved.invitationId)
      if (row?.invitedByUserId == null) return
      const membership = await this.deps.memberships.findByUserInTx(tx, orgId, row.invitedByUserId)
      return membership?.status === 'active' ? membership.userId : undefined
    })
    if (inviter === undefined) return
    await this.deps.notifications.notify(
      { orgId },
      {
        userId: inviter,
        type: 'invitation.reissue_requested',
        params: { version: 1, email: resolved.email },
        target: { type: 'invitation', id: resolved.invitationId },
        dedupeKey: `invitation-reissue-${resolved.invitationId}`,
      },
    )
  }

  /** The email job's outcome: "Not delivered · Copy invite link" shows for `failed`. */
  async recordDelivery(outcome: InvitationDeliveryOutcome): Promise<void> {
    await this.deps.db.tenant(outcome.orgId, (tx) =>
      this.deps.invitationsRepository.setDeliveryStatus(
        tx,
        outcome.orgId,
        outcome.invitationId,
        outcome.status,
      ),
    )
  }

  /** The notifications module's delivery listener: only invitation emails concern members. */
  readonly onEmailDelivery: EmailDeliveryListener = async ({ payload, status }) => {
    if (payload.template !== 'invitation') return
    await this.recordDelivery({ orgId: payload.orgId, invitationId: payload.invitationId, status })
  }

  /** The sign-up policy: an address with a pending invitation may create an account. */
  hasPendingInvitation(email: string): Promise<boolean> {
    return this.deps.invitationsRepository.hasPendingForEmail(
      this.deps.db.global,
      email.toLowerCase(),
    )
  }

  /** Pending invitations of a verified address, for the "No organization" screen. */
  listPendingForEmail(email: string): Promise<PendingInvitationForEmail[]> {
    return this.deps.invitationsRepository.listPendingForEmail(
      this.deps.db.global,
      email.toLowerCase(),
    )
  }

  // ---- Private ------------------------------------------------------------------------------

  private async resolveOrThrow(token: string) {
    const resolved = await this.deps.invitationsRepository.resolveToken(
      this.deps.db.global,
      hashToken(token),
    )
    if (resolved === undefined) throw new InvitationNotFoundError()
    return resolved
  }

  private async rotateInTx(
    tx: DbExecutor,
    orgId: string,
    invitationId: string,
    token: string,
    options: { resend: boolean },
  ): Promise<InvitationRow> {
    const repository = this.deps.invitationsRepository
    const current = await repository.findById(tx, orgId, invitationId)
    if (current === undefined) throw new InvitationNotFoundError()
    // A pending invitation whose time ran out can still be resent: that is what Resend is for.
    const error = current.status === 'pending' ? undefined : unusable(current.status)
    if (error !== undefined) throw error
    const rotated = await repository.rotateToken(tx, orgId, invitationId, hashToken(token), options)
    if (rotated === undefined) throw new InvitationNotFoundError()
    return rotated
  }

  private async organizationOrThrow(tx: DbExecutor, orgId: string): Promise<OrganizationDto> {
    const organization = await this.deps.organizations.getInTx(tx, orgId)
    if (organization === undefined) throw new InvitationNotFoundError()
    return organization
  }

  /** After the commit; the job ID makes a retried request queue the same send once. */
  private async queueEmail(
    row: InvitationRow,
    token: string,
    organization: OrganizationDto,
  ): Promise<void> {
    const inviter =
      row.invitedByUserId === null ? undefined : await this.deps.users.findById(row.invitedByUserId)
    await this.deps.notifications.queueEmail(
      {
        template: 'invitation',
        to: row.email,
        locale: organization.defaultLocale,
        orgId: row.organizationId,
        invitationId: row.id,
        url: this.urlOf(token),
        organizationName: organization.name,
        inviterName: inviter?.name ?? null,
      },
      { jobId: `invitation-${row.id}-${row.sendCount}` },
    )
  }

  private urlOf(token: string): string {
    return new URL(`${INVITE_PATH}${token}`, this.deps.config.web.apps.workspace).toString()
  }

  private async teamsOf(
    tx: DbExecutor,
    orgId: string,
    rows: readonly InvitationRow[],
  ): Promise<Map<string, TeamRefDto[]>> {
    const links = await this.deps.invitationsRepository.listTeamIds(
      tx,
      orgId,
      rows.map((row) => row.id),
    )
    const refs = new Map(
      (await this.deps.teams.findRefsInTx(tx, orgId, [...new Set(links.map((l) => l.teamId))])).map(
        (ref) => [ref.id, ref],
      ),
    )
    const byInvitation = new Map<string, TeamRefDto[]>()
    for (const link of links) {
      const ref = refs.get(link.teamId)
      if (ref === undefined) continue
      byInvitation.set(link.invitationId, [...(byInvitation.get(link.invitationId) ?? []), ref])
    }
    return byInvitation
  }

  private async toDto(
    row: InvitationRow,
    teams: Map<string, TeamRefDto[]>,
  ): Promise<InvitationDto> {
    const [dto] = await this.toDtos([row], teams)
    if (dto === undefined) throw new InvitationNotFoundError()
    return dto
  }

  private async toDtos(
    rows: readonly InvitationRow[],
    teams: Map<string, TeamRefDto[]>,
  ): Promise<InvitationDto[]> {
    const inviterIds = rows.flatMap((row) =>
      row.invitedByUserId === null ? [] : [row.invitedByUserId],
    )
    const inviters = await this.deps.users.findUserRefs(inviterIds)
    return rows.map((row) => {
      const inviter = row.invitedByUserId === null ? undefined : inviters.get(row.invitedByUserId)
      return {
        id: row.id,
        email: row.email,
        role: row.role,
        status: effectiveStatus(row),
        deliveryStatus: row.deliveryStatus,
        teams: teams.get(row.id) ?? [],
        invitedBy: inviter === undefined ? null : { userId: inviter.id, name: inviter.name },
        expiresAt: row.expiresAt.toISOString(),
        lastSentAt: row.lastSentAt?.toISOString() ?? null,
        sendCount: row.sendCount,
        acceptedAt: row.acceptedAt?.toISOString() ?? null,
        revokedAt: row.revokedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      }
    })
  }
}
