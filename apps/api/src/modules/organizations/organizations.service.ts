// SPDX-License-Identifier: AGPL-3.0-only
import {
  sqlState,
  type Database,
  type DbExecutor,
  type DbTransaction,
} from '@/core/database/index.js'
import { UnauthorizedError } from '@/core/errors/index.js'
import {
  FEATURE_EDITIONS,
  FEATURES,
  ORGANIZATION_SLUG_PATTERN,
  RESERVED_ORGANIZATION_SLUGS,
  type CreateOrganizationInput,
  type OrganizationDto,
  type OrganizationStatus,
  type SlugAvailabilityDto,
  type UpdateOrganizationInput,
} from '@surefy/contracts'

import { LOGO_URL_TTL_SECONDS } from './organizations.constants.js'
import {
  InvalidTimezoneError,
  OrganizationCreationNotAllowedError,
  OrganizationLimitReachedError,
  OrganizationNotFoundError,
  OrganizationSlugReservedError,
  OrganizationSlugTakenError,
} from './organizations.errors.js'
import { mergeSettings, toOrganizationDto } from './organizations.mapper.js'

import type {
  OrganizationPatch,
  OrganizationRow,
  OrganizationsRepository,
  ResolvedSlug,
} from './organizations.repository.js'
import type {
  CreateOrganizationOptions,
  InstallLimitsSource,
  OrganizationContext,
  OrganizationCreationRule,
  OrganizationOwner,
  OrganizationOwnerWriter,
} from './organizations.types.js'
import type { StorageProvider } from '@/integrations/storage/index.js'
import type { ActorContext } from '@/types/context.js'

export interface OrganizationsServiceDeps {
  db: Database
  storage: StorageProvider
  organizationsRepository: OrganizationsRepository
  owners: OrganizationOwnerWriter
  installLimits: InstallLimitsSource
  creationRule: OrganizationCreationRule
}

/** A new organization and the Owner membership created with it. */
export interface CreatedOrganization {
  organization: OrganizationDto
  memberId: string
}

const UNIQUE_VIOLATION = '23505'
const RESERVED = new Set<string>(RESERVED_ORGANIZATION_SLUGS)

const isTimezone = (timezone: string): boolean => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone })
    return true
  } catch {
    return false
  }
}

const assertTimezone = (timezone: string | undefined): void => {
  if (timezone !== undefined && !isTimezone(timezone)) throw new InvalidTimezoneError()
}

/** Turns a unique violation on a slug into the friendly conflict; rethrows anything else. */
const slugConflict = (error: unknown): never => {
  if (sqlState(error) === UNIQUE_VIOLATION) throw new OrganizationSlugTakenError()
  throw error
}

const signedInUser = (actor: ActorContext | null): string => {
  if (actor?.userId == null) throw new UnauthorizedError()
  return actor.userId
}

/**
 * The tenant itself (organizations-and-members.md, §1–2): creation under the install's
 * organization limit, settings, slugs and their redirects, and the access version other modules
 * bump when they change who can do what.
 */
export class OrganizationsService {
  constructor(private readonly deps: OrganizationsServiceDeps) {}

  async get(ctx: OrganizationContext): Promise<OrganizationDto> {
    const row = await this.deps.db.tenant(ctx.orgId, (tx) =>
      this.deps.organizationsRepository.findById(tx, ctx.orgId),
    )
    if (row === undefined) throw new OrganizationNotFoundError()
    return this.toDto(row)
  }

  /** Settings › General, Security, Data & privacy. A slug change keeps the old one redirecting. */
  async update(ctx: OrganizationContext, input: UpdateOrganizationInput): Promise<OrganizationDto> {
    assertTimezone(input.timezone)
    if (input.slug !== undefined && RESERVED.has(input.slug)) {
      throw new OrganizationSlugReservedError()
    }
    const repository = this.deps.organizationsRepository
    const row = await this.deps.db
      .tenant(ctx.orgId, async (tx) => {
        const current = await repository.findById(tx, ctx.orgId)
        if (current === undefined) throw new OrganizationNotFoundError()
        const patch: OrganizationPatch = {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.timezone === undefined ? {} : { timezone: input.timezone }),
          ...(input.defaultLocale === undefined ? {} : { defaultLocale: input.defaultLocale }),
          ...(input.currency === undefined ? {} : { currency: input.currency }),
          ...(input.settings === undefined
            ? {}
            : { settings: mergeSettings(current.settings, input.settings) }),
        }
        if (input.slug !== undefined && input.slug !== current.slug) {
          await this.changeSlugInTx(tx, current, input.slug)
          patch.slug = input.slug
        }
        if (Object.keys(patch).length === 0) return current
        return repository.update(tx, ctx.orgId, patch)
      })
      .catch(slugConflict)
    if (row === undefined) throw new OrganizationNotFoundError()
    return this.toDto(row)
  }

  /**
   * `POST /organizations` ("Create organization"): the install's creation policy and organization
   * limit decide; the person becomes its Owner.
   */
  async create(
    actor: ActorContext | null,
    input: CreateOrganizationInput,
  ): Promise<OrganizationDto> {
    const userId = signedInUser(actor)
    if (!(await this.deps.creationRule.mayCreateOrganization(userId))) {
      throw new OrganizationCreationNotAllowedError()
    }
    const { organization } = await this.createWithOwner(input, {
      userId,
      provisioningSource: 'setup',
    })
    return organization
  }

  /**
   * Creates an organization and its first Owner in one `db.tenant(newOrgId)` transaction
   * (organizations-and-members.md, Creation). Server-side callers such as first-run setup pass
   * `{ enforceLimit: false }`; everything else counts against the organization limit.
   */
  async createWithOwner(
    input: CreateOrganizationInput,
    owner: OrganizationOwner,
    options: CreateOrganizationOptions = {},
  ): Promise<CreatedOrganization> {
    assertTimezone(input.timezone)
    const orgId = await this.newOrganizationId()
    const { row, memberId } = await this.deps.db
      .tenant(orgId, async (tx) => {
        if (options.enforceLimit !== false) await this.assertBelowLimitInTx(tx)
        return this.createWithOwnerInTx(tx, orgId, input, owner)
      })
      .catch(slugConflict)
    return { organization: await this.toDto(row), memberId }
  }

  /**
   * Transaction-participating: the caller opened `db.tenant(orgId)` with an id from
   * `newOrganizationId()` and checked the organization limit when it applies.
   */
  async createWithOwnerInTx(
    tx: DbTransaction,
    orgId: string,
    input: CreateOrganizationInput,
    owner: OrganizationOwner,
  ): Promise<{ row: OrganizationRow; memberId: string }> {
    const repository = this.deps.organizationsRepository
    if (RESERVED.has(input.slug)) throw new OrganizationSlugReservedError()
    await repository.lockSlug(tx, input.slug)
    if (!(await repository.isSlugAvailable(tx, input.slug))) throw new OrganizationSlugTakenError()
    const row = await repository.insert(tx, {
      id: orgId,
      name: input.name,
      slug: input.slug,
      ...(input.timezone === undefined ? {} : { timezone: input.timezone }),
      ...(input.defaultLocale === undefined ? {} : { defaultLocale: input.defaultLocale }),
      createdByUserId: owner.userId,
    })
    const { memberId } = await this.deps.owners.insertOwnerInTx(tx, {
      orgId,
      userId: owner.userId,
      provisioningSource: owner.provisioningSource,
    })
    return { row, memberId }
  }

  /** The id of an organization about to be created, generated before its transaction opens. */
  newOrganizationId(): Promise<string> {
    return this.deps.organizationsRepository.newId(this.deps.db.global)
  }

  /**
   * Transaction-participating: takes the creation lock, then refuses with `LIMIT_REACHED` when
   * the install already holds `maxOrganizations` organizations (ADR 0016).
   */
  async assertBelowLimitInTx(tx: DbTransaction): Promise<void> {
    const repository = this.deps.organizationsRepository
    await repository.lockCreation(tx)
    const { maxOrganizations } = await this.deps.installLimits.getInstallLimits()
    if (maxOrganizations === null) return
    const used = await repository.countOnInstall(tx)
    if (used >= maxOrganizations) {
      throw new OrganizationLimitReachedError({
        limit: 'organizations',
        max: maxOrganizations,
        used,
        source: this.deps.installLimits.name,
        minimumEdition: FEATURE_EDITIONS[FEATURES.MULTI_ORGANIZATION].minimum,
      })
    }
  }

  /** `/me`: the creation policy allows the person and the install is below its limit. */
  async canCreateOrganization(userId: string): Promise<boolean> {
    if (!(await this.deps.creationRule.mayCreateOrganization(userId))) return false
    const { maxOrganizations } = await this.deps.installLimits.getInstallLimits()
    if (maxOrganizations === null) return true
    const used = await this.deps.organizationsRepository.countOnInstall(this.deps.db.global)
    return used < maxOrganizations
  }

  /** Public, before sign-up and setup: says why a slug cannot be used. */
  async slugAvailability(slug: string): Promise<SlugAvailabilityDto> {
    if (!ORGANIZATION_SLUG_PATTERN.test(slug)) return { slug, available: false, reason: 'invalid' }
    if (RESERVED.has(slug)) return { slug, available: false, reason: 'reserved' }
    const available = await this.deps.organizationsRepository.isSlugAvailable(
      this.deps.db.global,
      slug,
    )
    return { slug, available, reason: available ? null : 'taken' }
  }

  /**
   * Workspace routing by slug (definer `organization_resolve_slug`). The caller checks membership
   * and answers 404 to non-members, whether the slug is current or retired.
   */
  resolveSlug(slug: string): Promise<ResolvedSlug | undefined> {
    return this.deps.organizationsRepository.resolveSlug(this.deps.db.global, slug)
  }

  /**
   * Transaction-participating: bump in the same transaction as any change to who can do what, so
   * the cached effective access of the organization is invalidated (Access version).
   */
  bumpAccessVersionInTx(tx: DbExecutor, orgId: string): Promise<void> {
    return this.deps.organizationsRepository.bumpAccessVersion(tx, orgId)
  }

  /** Transaction-participating: the organization, for modules that embed or show it. */
  async getInTx(tx: DbExecutor, orgId: string): Promise<OrganizationDto | undefined> {
    const row = await this.deps.organizationsRepository.findById(tx, orgId)
    return row === undefined ? undefined : this.toDto(row)
  }

  /** Transaction-participating: the lifecycle status the access check needs, without signing URLs. */
  async findStatusInTx(tx: DbExecutor, orgId: string): Promise<OrganizationStatus | undefined> {
    const row = await this.deps.organizationsRepository.findById(tx, orgId)
    return row?.status
  }

  /** The signed URL of a stored logo; null when the organization has none. */
  logoUrl(key: string | null): Promise<string | null> {
    if (key === null) return Promise.resolve(null)
    return this.deps.storage.getSignedUrl(key, { expiresInSeconds: LOGO_URL_TTL_SECONDS })
  }

  /**
   * One transaction with the update: lock the new slug, check it, retire the old one (it
   * redirects for 90 days) and take back the organization's own recent redirect for the new one.
   */
  private async changeSlugInTx(
    tx: DbTransaction,
    current: OrganizationRow,
    slug: string,
  ): Promise<void> {
    const repository = this.deps.organizationsRepository
    await repository.lockSlug(tx, slug)
    if (!(await repository.isSlugAvailable(tx, slug))) {
      const holder = await repository.resolveSlug(tx, slug)
      const ownRedirect = holder?.organizationId === current.id && holder.isRedirect
      if (!ownRedirect) throw new OrganizationSlugTakenError()
    }
    await repository.deleteSlugHistory(tx, current.id, slug)
    await repository.insertSlugHistory(tx, current.id, current.slug)
  }

  private async toDto(row: OrganizationRow): Promise<OrganizationDto> {
    return toOrganizationDto(row, await this.logoUrl(row.logoObjectKey))
  }
}
