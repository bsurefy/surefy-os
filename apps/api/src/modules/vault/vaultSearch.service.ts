// SPDX-License-Identifier: AGPL-3.0-only
import {
  isSearchProviderError,
  type ResolvedSearchProvider,
  type SearchCredentials,
  type SearchProviderResolver,
  type SearchProviders,
} from '@/integrations/search/index.js'
import {
  SEARCH_PROVIDER_KEYS,
  VAULT_AUDIT_ACTIONS,
  type ConnectionFailureCode,
  type CreateSearchProviderInput,
  type CredentialDto,
  type SearchConnectionTestInput,
  type SearchProviderKey,
  type SearchProviderSettingsDto,
} from '@surefy/contracts'

import {
  VaultConnectionFailedError,
  VaultCredentialNotFoundError,
  VaultCredentialRevokedError,
  VaultProviderNotAllowedError,
} from './vault.errors.js'
import { toCredentialDto } from './vault.mapper.js'

import type { CredentialRow, VaultRepository } from './vault.repository.js'
import type { VaultContext, VaultInstallSearch, VaultUsage, VaultUserRefs } from './vault.types.js'
import type { SecretCipher } from '@/core/crypto/index.js'
import type { Database, DbExecutor } from '@/core/database/index.js'
import type { Logger } from '@/core/logger/index.js'
import type { AuditRecorder } from '@/modules/audit/index.js'

export interface VaultSearchServiceDeps {
  db: Database
  secrets: SecretCipher
  providers: SearchProviders
  vaultRepository: VaultRepository
  users: VaultUserRefs
  usage: VaultUsage
  install: VaultInstallSearch
  audit: AuditRecorder
  logger: Logger
  now?: () => Date
}

/** What a search connection test found, before it becomes the DTO. */
export interface SearchTestOutcome {
  ok: boolean
  latencyMs: number | null
  reasonCode: ConnectionFailureCode | null
  checkedUrl: string | null
}

const TABLE = 'vault_credentials'
const TEST_QUERY = 'SurefyOS'
const TEST_TIMEOUT_MS = 20_000
const KEYS: readonly string[] = SEARCH_PROVIDER_KEYS

/**
 * Web search providers in Vault (vault-and-models.md, §2, kind `search_provider`): organization
 * scope only, one primary. Also what the search integration asks for the provider to use: the
 * primary stored provider, else the install's SearXNG address.
 */
export class VaultSearchService implements SearchProviderResolver {
  private readonly now: () => Date

  constructor(private readonly deps: VaultSearchServiceDeps) {
    this.now = deps.now ?? (() => new Date())
  }

  // ── Reads ─────────────────────────────────────────────────────────────────────────────────────

  /** `GET …/search-providers`: the stored providers and the one web search uses now. */
  async settings(ctx: VaultContext): Promise<SearchProviderSettingsDto> {
    const rows = await this.deps.db.tenant(ctx.orgId, (tx) =>
      this.deps.vaultRepository.listSearchProviders(tx, ctx.orgId),
    )
    const providers = await this.deps.db.tenant(ctx.orgId, (tx) => this.toDtos(tx, ctx, rows))
    const resolved = await this.resolve(ctx.orgId)
    return {
      providers,
      active:
        resolved === null
          ? null
          : {
              providerKey: resolved.providerKey,
              source: resolved.source,
              credentialId: resolved.credentialId,
            },
    }
  }

  // ── Connection tests ──────────────────────────────────────────────────────────────────────────

  /** `POST …/connection-tests` for a search provider: one result for a harmless query. */
  testInput(input: SearchConnectionTestInput): Promise<SearchTestOutcome> {
    return this.runTest(input.providerKey, {
      ...(input.baseUrl === undefined ? {} : { baseUrl: input.baseUrl }),
      ...(input.secret === undefined ? {} : { apiKey: input.secret }),
    })
  }

  /** A stored provider tested again; its health is recorded. */
  async testStored(ctx: VaultContext, row: CredentialRow): Promise<SearchTestOutcome> {
    const credentials = await this.deps.db.tenant(ctx.orgId, (tx) => this.decrypt(tx, row))
    const outcome = await this.runTest(row.providerKey, credentials)
    await this.deps.db.tenant(ctx.orgId, (tx) => this.setHealth(tx, ctx.orgId, row.id, outcome))
    return outcome
  }

  // ── Providers ─────────────────────────────────────────────────────────────────────────────────

  /** `POST …/search-providers`: Save runs the test first; the first provider becomes primary. */
  async create(ctx: VaultContext, input: CreateSearchProviderInput): Promise<CredentialDto> {
    if (!KEYS.includes(input.providerKey)) throw new VaultProviderNotAllowedError()
    const secret = 'secret' in input ? input.secret : undefined
    const baseUrl = 'baseUrl' in input ? input.baseUrl : undefined
    const outcome = await this.runTest(input.providerKey, {
      ...(baseUrl === undefined ? {} : { baseUrl }),
      ...(secret === undefined ? {} : { apiKey: secret }),
    })
    if (!outcome.ok) throw failed(outcome)
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const id = await this.deps.vaultRepository.newId(tx)
      const encrypted =
        secret === undefined
          ? {}
          : await this.deps.secrets.encrypt(
              tx,
              { table: TABLE, id, organizationId: ctx.orgId },
              secret,
            )
      const isPrimary = !(await this.deps.vaultRepository.listSearchProviders(tx, ctx.orgId)).some(
        (row) => row.isPrimary,
      )
      const row = await this.deps.vaultRepository.insert(tx, {
        id,
        organizationId: ctx.orgId,
        name: input.name,
        kind: 'search_provider',
        providerKey: input.providerKey,
        scope: 'organization',
        isPrimary,
        baseUrl: baseUrl ?? null,
        ...encrypted,
        status: 'active',
        statusCheckedAt: this.now(),
        lastSuccessAt: this.now(),
        expiresAt: 'expiresAt' in input && input.expiresAt ? new Date(input.expiresAt) : null,
        createdByUserId: ctx.userId,
      })
      await this.deps.audit.record(tx, ctx, {
        action: VAULT_AUDIT_ACTIONS.VAULT_KEY_ADDED,
        target: { type: 'vault_credential', id },
        metadata: { labels: { providerKey: input.providerKey, scope: 'organization', isPrimary } },
      })
      return this.toDto(tx, ctx, row)
    })
  }

  /** The provider takes over every web search; the old primary stays stored and unused. */
  async makePrimary(tx: DbExecutor, ctx: VaultContext, row: CredentialRow): Promise<void> {
    if (row.status === 'revoked') throw new VaultCredentialRevokedError()
    if (row.isPrimary) return
    const current = (await this.deps.vaultRepository.listSearchProviders(tx, ctx.orgId)).find(
      (candidate) => candidate.isPrimary,
    )
    if (current === undefined) {
      await this.deps.vaultRepository.update(tx, ctx.orgId, row.id, { isPrimary: true })
    } else {
      await this.deps.vaultRepository.switchPrimary(tx, ctx.orgId, current.id, row.id)
    }
    await this.deps.audit.record(tx, ctx, {
      action: VAULT_AUDIT_ACTIONS.VAULT_KEY_SWITCHED,
      target: { type: 'vault_credential', id: row.id },
      metadata: { refs: current === undefined ? {} : { previousCredentialId: current.id } },
    })
  }

  // ── What the search integration asks ──────────────────────────────────────────────────────────

  /** The provider to search with: the primary stored one, else the install's SearXNG address. */
  async resolve(orgId: string): Promise<ResolvedSearchProvider | null> {
    const stored = await this.deps.db.tenant(orgId, async (tx) => {
      const row = await this.deps.vaultRepository.primarySearchProvider(tx, orgId)
      if (row === undefined || !KEYS.includes(row.providerKey)) return null
      return { row, credentials: await this.decrypt(tx, row) }
    })
    if (stored !== null) {
      return {
        providerKey: stored.row.providerKey as SearchProviderKey,
        credentials: stored.credentials,
        credentialId: stored.row.id,
        source: 'vault',
      }
    }
    const searxngUrl = await this.deps.install.searxngUrl()
    if (searxngUrl === null) return null
    return {
      providerKey: 'searxng',
      credentials: { baseUrl: searxngUrl },
      credentialId: null,
      source: 'install',
    }
  }

  /** A search changed the provider's health: 401/403 → `error`, 429 → `rate_limited`, a success → `active`. */
  async recordHealth(
    orgId: string,
    credentialId: string,
    outcome: { ok: true } | { ok: false; reasonCode: string },
  ): Promise<void> {
    await this.deps.db.tenant(orgId, async (tx) => {
      const repository = this.deps.vaultRepository
      if (outcome.ok) {
        await repository.setStatus(tx, orgId, credentialId, 'active', null, true)
        await repository.touchLastUsed(tx, orgId, credentialId)
        return
      }
      const status = outcome.reasonCode === 'VAULT_QUOTA_EXCEEDED' ? 'rate_limited' : 'error'
      await repository.setStatus(tx, orgId, credentialId, status, outcome.reasonCode, false)
    })
  }

  // ── Internals ─────────────────────────────────────────────────────────────────────────────────

  private async runTest(
    providerKey: string,
    credentials: SearchCredentials,
  ): Promise<SearchTestOutcome> {
    const definition = this.deps.providers.get(providerKey)
    if (definition === undefined) throw new VaultProviderNotAllowedError()
    const started = performance.now()
    const checkedUrl = credentials.baseUrl ?? null
    try {
      await definition
        .connect(credentials)
        .search({ q: TEST_QUERY, limit: 1 }, AbortSignal.timeout(TEST_TIMEOUT_MS))
      return {
        ok: true,
        latencyMs: Math.round(performance.now() - started),
        reasonCode: null,
        checkedUrl,
      }
    } catch (error) {
      if (!isSearchProviderError(error)) throw error
      return { ok: false, latencyMs: null, reasonCode: error.reasonCode, checkedUrl }
    }
  }

  private async setHealth(tx: DbExecutor, orgId: string, id: string, outcome: SearchTestOutcome) {
    if (outcome.ok) {
      await this.deps.vaultRepository.setStatus(tx, orgId, id, 'active', null, true)
      return
    }
    const status = outcome.reasonCode === 'VAULT_QUOTA_EXCEEDED' ? 'rate_limited' : 'error'
    await this.deps.vaultRepository.setStatus(tx, orgId, id, status, outcome.reasonCode, false)
  }

  private async decrypt(tx: DbExecutor, row: CredentialRow): Promise<SearchCredentials> {
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

  private async toDto(tx: DbExecutor, ctx: VaultContext, row: CredentialRow) {
    const [dto] = await this.toDtos(tx, ctx, [row])
    if (dto === undefined) throw new VaultCredentialNotFoundError()
    return dto
  }

  private async toDtos(
    tx: DbExecutor,
    ctx: VaultContext,
    rows: readonly CredentialRow[],
  ): Promise<CredentialDto[]> {
    const ids = rows.map((row) => row.id)
    const userIds = [
      ...new Set(
        rows.flatMap((row) => (row.createdByUserId === null ? [] : [row.createdByUserId])),
      ),
    ]
    const refs = {
      teams: new Map(),
      users: await this.deps.users.findUserRefs(userIds),
      replacements: await this.deps.vaultRepository.replacements(tx, ctx.orgId, ids),
      spend: await this.deps.usage.spendThisMonth(tx, ctx.orgId, ids),
      modelCounts: new Map<string, number>(),
      viewerUserId: ctx.userId,
    }
    return rows.map((row) => toCredentialDto(row, refs))
  }
}

function failed(outcome: SearchTestOutcome): VaultConnectionFailedError {
  const code = outcome.reasonCode ?? 'LOCAL_SERVER_UNREACHABLE'
  return new VaultConnectionFailedError(code, 'The connection test did not pass')
}
