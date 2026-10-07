// SPDX-License-Identifier: AGPL-3.0-only
import {
  isAiProviderError,
  type AiProviderCredentials,
  type AiProviders,
  type DiscoveredModel,
} from '@/integrations/ai/index.js'
import { decodeCursor, toPage } from '@/lib/pagination.js'
import {
  AI_PROVIDER_KEYS,
  CONNECTION_TEST_TIMEOUT_SECONDS,
  KEY_EXPIRY_WARNING_DAYS,
  LOCAL_SERVER_PROVIDER_KEYS,
  VAULT_AUDIT_ACTIONS,
} from '@surefy/contracts'
import type {
  ConnectionFailureCode,
  ConnectionTestDto,
  ConnectionTestInput,
  CreateCredentialInput,
  CreateLocalServerInput,
  CreatePersonalCredentialInput,
  CredentialDto,
  CredentialImpactDto,
  CredentialScope,
  ListCredentialsQuery,
  ListMyCredentialsQuery,
  LocalServerSyncDto,
  ProviderCardDto,
  ProviderCardStatus,
  UpdateCredentialInput,
} from '@surefy/contracts'

import {
  VaultConnectionFailedError,
  VaultCredentialNotFoundError,
  VaultCredentialRevokedError,
  VaultPersonalKeysDisabledError,
  VaultProviderNotAllowedError,
  VaultRotationMismatchError,
  VaultServerInUseError,
  VaultTeamNotFoundError,
} from './vault.errors.js'
import { toCredentialDto, type CredentialRefs } from './vault.mapper.js'
import { credentialSort, type CredentialRow, type VaultRepository } from './vault.repository.js'

import type { ModelsService } from './models.service.js'
import type { ModelSync } from './modelSync.js'
import type {
  VaultAccess,
  VaultContext,
  VaultTeams,
  VaultUsage,
  VaultUserRefs,
} from './vault.types.js'
import type { SecretCipher } from '@/core/crypto/index.js'
import type { Database, DbExecutor } from '@/core/database/index.js'
import type { AuditRecorder } from '@/modules/audit/index.js'

export interface VaultServiceDeps {
  db: Database
  secrets: SecretCipher
  ai: AiProviders
  vaultRepository: VaultRepository
  modelSync: ModelSync
  models: Pick<ModelsService, 'fallbackFor'>
  access: VaultAccess
  teams: VaultTeams
  users: VaultUserRefs
  usage: VaultUsage
  audit: AuditRecorder
  now?: () => Date
}

const TABLE = 'vault_credentials'
const DAY_MS = 86_400_000
const LOCAL_KEYS: readonly string[] = LOCAL_SERVER_PROVIDER_KEYS
const AI_KEYS: readonly string[] = AI_PROVIDER_KEYS

/** The outcome of one connection test, before it becomes the DTO. */
interface TestOutcome {
  ok: boolean
  latencyMs: number | null
  reasonCode: ConnectionFailureCode | null
  checkedUrl: string | null
  models: DiscoveredModel[]
}

const credentialChanges = (before: CredentialRow, after: CredentialRow) =>
  (['name', 'expiresAt', 'baseUrl'] as const).flatMap((field) => {
    const from = before[field] instanceof Date ? before[field].toISOString() : before[field]
    const to = after[field] instanceof Date ? after[field].toISOString() : after[field]
    return from === to ? [] : [{ field, from, to }]
  })

/**
 * Provider keys and local servers (vault-and-models.md, §2). A key is stored only after its
 * connection test passes; the secret is encrypted with the organization's data key before the
 * insert and never leaves this module in plain text.
 */
export class VaultService {
  private readonly now: () => Date

  constructor(private readonly deps: VaultServiceDeps) {
    this.now = deps.now ?? (() => new Date())
  }

  // ── Reads ─────────────────────────────────────────────────────────────────────────────────────

  async listCredentials(
    ctx: VaultContext,
    query: ListCredentialsQuery,
  ): Promise<{ items: CredentialDto[]; nextCursor: string | null }> {
    const { limit, cursor, sort: sortParam, ...filters } = query
    const sort = credentialSort(sortParam)
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const rows = await this.deps.vaultRepository.listPage(tx, ctx.orgId, {
        limit,
        sort,
        filters,
        excludePersonal: true,
        ...(cursor === undefined ? {} : { cursor: decodeCursor(cursor) }),
      })
      const page = toPage(rows, limit, (row) => ({ k: row.sortKey, id: row.credential.id }))
      return {
        items: await this.toDtos(
          tx,
          ctx,
          page.items.map((row) => row.credential),
        ),
        nextCursor: page.nextCursor,
      }
    })
  }

  async listMyCredentials(
    ctx: VaultContext,
    query: ListMyCredentialsQuery,
  ): Promise<{ items: CredentialDto[]; nextCursor: string | null }> {
    const userId = requireUser(ctx)
    const sort = credentialSort('createdAt')
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const rows = await this.deps.vaultRepository.listPersonalPage(tx, ctx.orgId, userId, {
        limit: query.limit,
        sort,
        ...(query.cursor === undefined ? {} : { cursor: decodeCursor(query.cursor) }),
      })
      const page = toPage(rows, query.limit, (row) => ({ k: row.sortKey, id: row.credential.id }))
      return {
        items: await this.toDtos(
          tx,
          ctx,
          page.items.map((row) => row.credential),
        ),
        nextCursor: page.nextCursor,
      }
    })
  }

  async getCredential(ctx: VaultContext, id: string): Promise<CredentialDto> {
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const row = await this.findVisible(tx, ctx, id)
      return this.toDto(tx, ctx, row)
    })
  }

  /** `GET …/providers`: one card per provider or local server kind, plus the cloud providers not connected. */
  async providers(ctx: VaultContext): Promise<ProviderCardDto[]> {
    const now = this.now().getTime()
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const summaries = await this.deps.vaultRepository.providerSummaries(tx, ctx.orgId)
      const settings = await this.deps.models.fallbackFor(tx, ctx.orgId)
      const modelCounts = await this.deps.modelSync.countByProvider(tx, ctx.orgId)
      const cards = new Map<string, ProviderCardDto>()
      for (const providerKey of AI_KEYS) {
        cards.set(providerKey, {
          providerKey,
          status: 'not_connected',
          statusReasonCode: null,
          keyCount: 0,
          modelCount: modelCounts.get(providerKey) ?? 0,
          expiresAt: null,
          fallbackInUse: false,
        })
      }
      for (const summary of summaries) {
        const expiresAt = summary.expiresAt
        const isExpiring =
          expiresAt !== null && expiresAt.getTime() - now < KEY_EXPIRY_WARNING_DAYS * DAY_MS
        let status: ProviderCardStatus = 'connected'
        if (summary.activeCount === 0 && summary.rateLimitedCount > 0) status = 'rate_limited'
        else if (summary.activeCount === 0) status = 'error'
        else if (isExpiring) status = 'expiring'
        const previous = cards.get(summary.providerKey)
        cards.set(summary.providerKey, {
          providerKey: summary.providerKey,
          status,
          statusReasonCode:
            status === 'error' || status === 'rate_limited'
              ? (summary.firstReason as ConnectionFailureCode | null)
              : null,
          keyCount: (previous?.keyCount ?? 0) + summary.keyCount,
          modelCount: modelCounts.get(summary.providerKey) ?? 0,
          expiresAt: expiresAt?.toISOString() ?? null,
          fallbackInUse:
            status !== 'connected' && status !== 'expiring' && settings.order.length > 0,
        })
      }
      return [...cards.values()]
    })
  }

  // ── Connection tests ──────────────────────────────────────────────────────────────────────────

  /** `POST …/connection-tests`: before anything is saved; a failed test is a normal answer. */
  async testConnection(
    ctx: VaultContext,
    input: ConnectionTestInput,
    canManage: boolean,
  ): Promise<ConnectionTestDto> {
    // someone who may only add personal keys tests a cloud provider at its own address: no
    // local servers and no custom addresses, so the server never calls a URL they chose
    if (!canManage && (input.kind !== 'ai_provider' || input.baseUrl !== undefined)) {
      throw new VaultProviderNotAllowedError()
    }
    await this.assertProviderAllowed(
      ctx,
      input.kind,
      input.providerKey,
      canManage || ctx.userId === null ? null : { userId: ctx.userId },
    )
    const credentials = credentialsOf(input)
    const outcome = await this.runTest(input.providerKey, credentials)
    const duplicateOf =
      input.secret === undefined
        ? null
        : await this.deps.db.tenant(ctx.orgId, (tx) =>
            this.deps.vaultRepository.findByFingerprint(
              tx,
              ctx.orgId,
              this.deps.secrets.fingerprint(ctx.orgId, input.secret ?? ''),
            ),
          )
    return this.toTestDto(input.providerKey, outcome, duplicateOf ?? null)
  }

  /** `POST …/credentials/:credentialId/test`: tests a stored key and records its health. */
  async testCredential(ctx: VaultContext, id: string): Promise<ConnectionTestDto> {
    const { row, credentials } = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const found = await this.findVisible(tx, ctx, id)
      if (found.status === 'revoked') throw new VaultCredentialRevokedError()
      return { row: found, credentials: await this.decrypt(tx, found) }
    })
    const outcome = await this.runTest(row.providerKey, credentials)
    await this.deps.db.tenant(ctx.orgId, async (tx) => {
      await this.recordHealth(tx, row.id, ctx.orgId, outcome)
      await this.deps.audit.record(tx, ctx, {
        action: VAULT_AUDIT_ACTIONS.VAULT_KEY_TESTED,
        target: { type: 'vault_credential', id: row.id },
        outcome: outcome.ok ? 'success' : 'failed',
        metadata: {
          labels: { providerKey: row.providerKey },
          ...(outcome.reasonCode ? { codes: [outcome.reasonCode] } : {}),
        },
      })
    })
    return this.toTestDto(row.providerKey, outcome, null)
  }

  // ── Keys ──────────────────────────────────────────────────────────────────────────────────────

  /** `POST …/credentials`: an organization or team key; Save runs the connection test first. */
  async createCredential(ctx: VaultContext, input: CreateCredentialInput): Promise<CredentialDto> {
    const teamId = input.scope === 'team' ? input.teamId : null
    await this.assertTeam(ctx.orgId, teamId)
    await this.assertProviderAllowed(
      ctx,
      'ai_provider',
      input.providerKey,
      teamId === null ? null : { teamId },
    )
    return this.storeAiKey(ctx, input, { scope: input.scope, teamId, ownerUserId: null })
  }

  /** `POST …/my-credentials`: a personal key, when the access policy allows personal keys. */
  async createPersonalCredential(
    ctx: VaultContext,
    input: CreatePersonalCredentialInput,
  ): Promise<CredentialDto> {
    const userId = requireUser(ctx)
    const rules = await this.deps.access.providerRules(ctx.orgId, { userId })
    if (!rules.personalKeys) throw new VaultPersonalKeysDisabledError()
    // a personal key reaches its provider at the provider's own address
    if (input.baseUrl !== undefined) throw new VaultProviderNotAllowedError()
    await this.assertProviderAllowed(ctx, 'ai_provider', input.providerKey, { userId })
    return this.storeAiKey(ctx, input, { scope: 'personal', teamId: null, ownerUserId: userId })
  }

  async updateCredential(
    ctx: VaultContext,
    id: string,
    input: UpdateCredentialInput,
  ): Promise<CredentialDto> {
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const before = await this.findVisible(tx, ctx, id)
      if (before.status === 'revoked') throw new VaultCredentialRevokedError()
      const after = await this.deps.vaultRepository.update(tx, ctx.orgId, id, {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.expiresAt === undefined
          ? {}
          : { expiresAt: input.expiresAt === null ? null : new Date(input.expiresAt) }),
        ...(input.baseUrl === undefined || before.kind !== 'local_server'
          ? {}
          : { baseUrl: input.baseUrl }),
      })
      if (after === undefined) throw new VaultCredentialNotFoundError()
      const changes = credentialChanges(before, after)
      if (changes.length > 0) {
        await this.deps.audit.record(tx, ctx, {
          action: VAULT_AUDIT_ACTIONS.VAULT_KEY_UPDATED,
          target: { type: 'vault_credential', id },
          metadata: { changes },
        })
      }
      return this.toDto(tx, ctx, after)
    })
  }

  /** Rotation step 2: the key takes the traffic of the primary key of its provider and scope. */
  async makePrimary(ctx: VaultContext, id: string): Promise<CredentialDto> {
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const row = await this.findVisible(tx, ctx, id)
      if (row.status === 'revoked') throw new VaultCredentialRevokedError()
      if (row.isPrimary) return this.toDto(tx, ctx, row)
      const current = (
        await this.deps.vaultRepository.resolvableKeys(tx, ctx.orgId, {
          providerKey: row.providerKey,
          userId: row.ownerUserId,
          teamIds: row.teamId === null ? [] : [row.teamId],
        })
      ).find(
        (key) =>
          key.scope === row.scope &&
          key.teamId === row.teamId &&
          key.ownerUserId === row.ownerUserId,
      )
      if (current === undefined) {
        await this.deps.vaultRepository.update(tx, ctx.orgId, id, { isPrimary: true })
      } else {
        await this.deps.vaultRepository.switchPrimary(tx, ctx.orgId, current.id, id)
      }
      await this.deps.audit.record(tx, ctx, {
        action: VAULT_AUDIT_ACTIONS.VAULT_KEY_SWITCHED,
        target: { type: 'vault_credential', id },
        metadata: { refs: current === undefined ? {} : { previousCredentialId: current.id } },
      })
      return this.toDto(tx, ctx, await this.findOrThrow(tx, ctx.orgId, id))
    })
  }

  /** Revoke (T2): the secret is gone at once; last four characters and fingerprint stay. */
  async revoke(ctx: VaultContext, id: string): Promise<CredentialDto> {
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const row = await this.findVisible(tx, ctx, id)
      if (row.status === 'revoked') throw new VaultCredentialRevokedError()
      const revoked = await this.deps.vaultRepository.revoke(tx, ctx.orgId, id, ctx.userId)
      if (revoked === undefined) throw new VaultCredentialRevokedError()
      if (row.kind === 'ai_provider' && row.scope !== 'personal') {
        await this.deps.modelSync.refreshProviderAvailability(tx, ctx.orgId, row.providerKey)
      }
      if (row.kind === 'local_server') {
        await this.deps.modelSync.setServerAvailability(tx, ctx.orgId, row, false)
      }
      await this.deps.audit.record(tx, ctx, {
        action: VAULT_AUDIT_ACTIONS.VAULT_KEY_REVOKED,
        target: { type: 'vault_credential', id },
        metadata: { labels: { providerKey: row.providerKey, scope: row.scope } },
      })
      return this.toDto(tx, ctx, revoked)
    })
  }

  /** What a revoke, switch or removal affects (T2 dialogs). */
  async impact(ctx: VaultContext, id: string): Promise<CredentialImpactDto> {
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const row = await this.findVisible(tx, ctx, id)
      const fallback = await this.deps.models.fallbackFor(tx, ctx.orgId)
      return {
        // agents and flows record their dependencies once they exist (dependency_edges)
        dependents: [],
        listed: [],
        userCount: await this.deps.usage.usersThisMonth(tx, ctx.orgId, row.id),
        fallback: fallback.first,
      }
    })
  }

  // ── Local servers ─────────────────────────────────────────────────────────────────────────────

  async listLocalServers(
    ctx: VaultContext,
    query: ListMyCredentialsQuery,
  ): Promise<{ items: CredentialDto[]; nextCursor: string | null }> {
    return this.listCredentials(ctx, {
      limit: query.limit,
      cursor: query.cursor,
      kind: ['local_server'],
    })
  }

  /** `POST …/local-servers`: Save tests the server and stores its models, all disabled. */
  async createLocalServer(
    ctx: VaultContext,
    input: CreateLocalServerInput,
  ): Promise<CredentialDto> {
    const teamId = input.scope === 'team' ? input.teamId : null
    await this.assertTeam(ctx.orgId, teamId)
    await this.assertProviderAllowed(
      ctx,
      'local_server',
      input.providerKey,
      teamId === null ? null : { teamId },
    )
    const credentials: AiProviderCredentials = {
      baseUrl: input.baseUrl,
      ...(input.secret === undefined ? {} : { apiKey: input.secret }),
    }
    const outcome = await this.runTest(input.providerKey, credentials)
    if (!outcome.ok) throw failed(outcome)
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const id = await this.deps.vaultRepository.newId(tx)
      const encrypted =
        input.secret === undefined
          ? {}
          : await this.deps.secrets.encrypt(
              tx,
              { table: TABLE, id, organizationId: ctx.orgId },
              input.secret,
            )
      const row = await this.deps.vaultRepository.insert(tx, {
        id,
        organizationId: ctx.orgId,
        name: input.name,
        kind: 'local_server',
        providerKey: input.providerKey,
        scope: input.scope,
        teamId,
        isPrimary: false,
        baseUrl: input.baseUrl,
        ...encrypted,
        status: 'active',
        statusCheckedAt: this.now(),
        lastSuccessAt: this.now(),
        createdByUserId: ctx.userId,
      })
      await this.deps.modelSync.storeServerModels(tx, ctx.orgId, row, outcome.models)
      await this.deps.audit.record(tx, ctx, {
        action: VAULT_AUDIT_ACTIONS.VAULT_LOCAL_SERVER_ADDED,
        target: { type: 'vault_credential', id },
        metadata: {
          labels: { providerKey: input.providerKey },
          counts: { models: outcome.models.length },
        },
      })
      return this.toDto(tx, ctx, row)
    })
  }

  /** `POST …/local-servers/:serverId/sync`: lists the server's models again. */
  async syncLocalServer(ctx: VaultContext, id: string): Promise<LocalServerSyncDto> {
    const { row, credentials } = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const found = await this.findServer(tx, ctx.orgId, id)
      return { row: found, credentials: await this.decrypt(tx, found) }
    })
    const outcome = await this.runTest(row.providerKey, credentials)
    // the health and the models' availability are kept even when the sync fails
    const result = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      await this.recordHealth(tx, row.id, ctx.orgId, outcome)
      if (!outcome.ok) {
        await this.deps.modelSync.setServerAvailability(tx, ctx.orgId, row, false)
        return null
      }
      return this.deps.modelSync.storeServerModels(tx, ctx.orgId, row, outcome.models)
    })
    if (result === null) throw failed(outcome)
    return { models: this.detected(row.providerKey, outcome.models), ...result }
  }

  /** Remove a server (T2): its models go with it, unless one is the embedding model. */
  async deleteLocalServer(ctx: VaultContext, id: string): Promise<void> {
    await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const row = await this.findServer(tx, ctx.orgId, id)
      if (await this.deps.modelSync.isEmbeddingServer(tx, ctx.orgId, row.id)) {
        throw new VaultServerInUseError()
      }
      await this.deps.vaultRepository.delete(tx, ctx.orgId, id)
      await this.deps.audit.record(tx, ctx, {
        action: VAULT_AUDIT_ACTIONS.VAULT_LOCAL_SERVER_REMOVED,
        target: { type: 'vault_credential', id },
        metadata: { labels: { providerKey: row.providerKey, name: row.name } },
      })
    })
  }

  // ── Internals ─────────────────────────────────────────────────────────────────────────────────

  private async storeAiKey(
    ctx: VaultContext,
    input: CreatePersonalCredentialInput,
    owner: { scope: CredentialScope; teamId: string | null; ownerUserId: string | null },
  ): Promise<CredentialDto> {
    if (!AI_KEYS.includes(input.providerKey)) throw new VaultProviderNotAllowedError()
    if (input.rotatesCredentialId !== undefined) {
      await this.deps.db.tenant(ctx.orgId, async (tx) => {
        const old = await this.findOrThrow(tx, ctx.orgId, input.rotatesCredentialId ?? '')
        const sameSlot =
          old.kind === 'ai_provider' &&
          old.providerKey === input.providerKey &&
          old.scope === owner.scope &&
          old.teamId === owner.teamId &&
          old.ownerUserId === owner.ownerUserId
        if (!sameSlot) throw new VaultRotationMismatchError()
        if (old.status === 'revoked') throw new VaultCredentialRevokedError()
      })
    }
    const credentials: AiProviderCredentials = {
      apiKey: input.secret,
      ...(input.baseUrl === undefined ? {} : { baseUrl: input.baseUrl }),
    }
    const outcome = await this.runTest(input.providerKey, credentials)
    if (!outcome.ok) throw failed(outcome)
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const id = await this.deps.vaultRepository.newId(tx)
      const encrypted = await this.deps.secrets.encrypt(
        tx,
        { table: TABLE, id, organizationId: ctx.orgId },
        input.secret,
      )
      const isPrimary =
        input.rotatesCredentialId === undefined &&
        !(await this.deps.vaultRepository.hasPrimary(tx, ctx.orgId, {
          providerKey: input.providerKey,
          ...owner,
        }))
      const row = await this.deps.vaultRepository.insert(tx, {
        id,
        organizationId: ctx.orgId,
        name: input.name,
        kind: 'ai_provider',
        providerKey: input.providerKey,
        scope: owner.scope,
        teamId: owner.teamId,
        ownerUserId: owner.ownerUserId,
        isPrimary,
        baseUrl: input.baseUrl ?? null,
        ...encrypted,
        status: 'active',
        statusCheckedAt: this.now(),
        lastSuccessAt: this.now(),
        expiresAt: input.expiresAt === undefined ? null : new Date(input.expiresAt),
        rotatedFromId: input.rotatesCredentialId ?? null,
        createdByUserId: ctx.userId,
      })
      // models reachable only through personal keys are not stored (vault-and-models.md, §3)
      if (owner.scope !== 'personal') {
        await this.deps.modelSync.storeProviderModels(tx, ctx, input.providerKey, outcome.models)
      }
      await this.deps.audit.record(tx, ctx, {
        action: VAULT_AUDIT_ACTIONS.VAULT_KEY_ADDED,
        target: { type: 'vault_credential', id },
        metadata: {
          labels: { providerKey: input.providerKey, scope: owner.scope, isPrimary },
          ...(input.rotatesCredentialId === undefined
            ? {}
            : { refs: { rotatesCredentialId: input.rotatesCredentialId } }),
        },
      })
      return this.toDto(tx, ctx, row)
    })
  }

  /** Lists the models, within the test window; a failure is an outcome, not an exception. */
  private async runTest(
    providerKey: string,
    credentials: AiProviderCredentials,
  ): Promise<TestOutcome> {
    const provider = this.deps.ai.get(providerKey)
    if (provider === undefined) throw new VaultProviderNotAllowedError()
    const started = performance.now()
    const signal = AbortSignal.timeout(CONNECTION_TEST_TIMEOUT_SECONDS * 1000)
    const checkedUrl = provider.capabilities.local
      ? safe(() => provider.checkedUrl(credentials))
      : null
    try {
      const models = await provider.listModels(credentials, signal)
      return {
        ok: true,
        latencyMs: Math.round(performance.now() - started),
        reasonCode: null,
        checkedUrl,
        models,
      }
    } catch (error) {
      if (!isAiProviderError(error)) throw error
      return { ok: false, latencyMs: null, reasonCode: error.reasonCode, checkedUrl, models: [] }
    }
  }

  private async recordHealth(tx: DbExecutor, id: string, orgId: string, outcome: TestOutcome) {
    if (outcome.ok) {
      await this.deps.vaultRepository.setStatus(tx, orgId, id, 'active', null, true)
      return
    }
    const status = outcome.reasonCode === 'VAULT_QUOTA_EXCEEDED' ? 'rate_limited' : 'error'
    await this.deps.vaultRepository.setStatus(tx, orgId, id, status, outcome.reasonCode, false)
  }

  private toTestDto(
    providerKey: string,
    outcome: TestOutcome,
    duplicateOf: { id: string; name: string } | null,
  ): ConnectionTestDto {
    return {
      ok: outcome.ok,
      latencyMs: outcome.latencyMs,
      reasonCode: outcome.reasonCode,
      checkedUrl: outcome.checkedUrl,
      models: this.detected(providerKey, outcome.models),
      duplicateOf,
      testedAt: this.now().toISOString(),
    }
  }

  private detected(providerKey: string, models: readonly DiscoveredModel[]) {
    return this.deps.modelSync.detected(providerKey, models)
  }

  private async decrypt(tx: DbExecutor, row: CredentialRow): Promise<AiProviderCredentials> {
    const secret = await this.deps.secrets.decrypt(
      tx,
      { table: TABLE, id: row.id, organizationId: row.organizationId },
      row,
    )
    return {
      ...(secret === null ? {} : { apiKey: secret }),
      ...(row.baseUrl === null ? {} : { baseUrl: row.baseUrl }),
    }
  }

  private async assertProviderAllowed(
    ctx: VaultContext,
    kind: 'ai_provider' | 'local_server',
    providerKey: string,
    subject: { teamId: string } | { userId: string } | null,
  ): Promise<void> {
    const known =
      kind === 'local_server' ? LOCAL_KEYS.includes(providerKey) : AI_KEYS.includes(providerKey)
    if (!known) throw new VaultProviderNotAllowedError()
    const rules = await this.deps.access.providerRules(ctx.orgId, subject)
    if (kind === 'local_server' && !rules.localModels) throw new VaultProviderNotAllowedError()
    if (
      kind === 'ai_provider' &&
      rules.providersAllowed !== null &&
      !rules.providersAllowed.includes(providerKey)
    ) {
      throw new VaultProviderNotAllowedError()
    }
  }

  /** A team-scoped key or server belongs to a team of this organization. */
  private async assertTeam(orgId: string, teamId: string | null): Promise<void> {
    if (teamId === null) return
    const [team] = await this.deps.db.tenant(orgId, (tx) =>
      this.deps.teams.findRefsInTx(tx, orgId, [teamId]),
    )
    if (team === undefined) throw new VaultTeamNotFoundError()
  }

  private async findOrThrow(tx: DbExecutor, orgId: string, id: string): Promise<CredentialRow> {
    const row = await this.deps.vaultRepository.findById(tx, orgId, id)
    if (row === undefined) throw new VaultCredentialNotFoundError()
    return row
  }

  /** Another person's personal key does not exist for the caller. */
  private async findVisible(tx: DbExecutor, ctx: VaultContext, id: string): Promise<CredentialRow> {
    const row = await this.findOrThrow(tx, ctx.orgId, id)
    if (row.scope === 'personal' && row.ownerUserId !== ctx.userId)
      throw new VaultCredentialNotFoundError()
    return row
  }

  private async findServer(tx: DbExecutor, orgId: string, id: string): Promise<CredentialRow> {
    const row = await this.findOrThrow(tx, orgId, id)
    if (row.kind !== 'local_server') throw new VaultCredentialNotFoundError()
    return row
  }

  private async toDto(
    tx: DbExecutor,
    ctx: VaultContext,
    row: CredentialRow,
  ): Promise<CredentialDto> {
    const [dto] = await this.toDtos(tx, ctx, [row])
    if (dto === undefined) throw new Error('credential mapping returned nothing')
    return dto
  }

  private async toDtos(
    tx: DbExecutor,
    ctx: VaultContext,
    rows: readonly CredentialRow[],
  ): Promise<CredentialDto[]> {
    const ids = rows.map((row) => row.id)
    const teamIds = [...new Set(rows.flatMap((row) => (row.teamId === null ? [] : [row.teamId])))]
    const userIds = [
      ...new Set(
        rows.flatMap((row) =>
          [row.ownerUserId, row.createdByUserId].filter((v): v is string => v !== null),
        ),
      ),
    ]
    const refs: CredentialRefs = {
      teams: new Map(
        (await this.deps.teams.findRefsInTx(tx, ctx.orgId, teamIds)).map((t) => [t.id, t]),
      ),
      users: await this.deps.users.findUserRefs(userIds),
      replacements: await this.deps.vaultRepository.replacements(tx, ctx.orgId, ids),
      spend: await this.deps.usage.spendThisMonth(tx, ctx.orgId, ids),
      modelCounts: await this.deps.vaultRepository.modelCounts(
        tx,
        ctx.orgId,
        rows.filter((row) => row.kind === 'local_server').map((row) => row.id),
      ),
      viewerUserId: ctx.userId,
    }
    return rows.map((row) => toCredentialDto(row, refs))
  }
}

function credentialsOf(input: ConnectionTestInput): AiProviderCredentials {
  return {
    ...(input.secret === undefined ? {} : { apiKey: input.secret }),
    ...(input.baseUrl === undefined ? {} : { baseUrl: input.baseUrl }),
  }
}

function requireUser(ctx: VaultContext): string {
  if (ctx.userId === null) throw new VaultPersonalKeysDisabledError()
  return ctx.userId
}

function failed(outcome: TestOutcome): VaultConnectionFailedError {
  const code = outcome.reasonCode ?? 'LOCAL_SERVER_UNREACHABLE'
  return new VaultConnectionFailedError(code, 'The connection test did not pass')
}

function safe(fn: () => string): string | null {
  try {
    return fn()
  } catch {
    return null
  }
}
