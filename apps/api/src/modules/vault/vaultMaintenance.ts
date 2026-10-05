// SPDX-License-Identifier: AGPL-3.0-only
import { and, eq, exists, gt, inArray, lte, ne, sql } from 'drizzle-orm'

import { organizationMembers, vaultCredentials, vaultModels } from '@/database/tables/index.js'
import {
  isAiProviderError,
  type AiProviderCredentials,
  type AiProviders,
  type DiscoveredModel,
} from '@/integrations/ai/index.js'
import {
  CONNECTION_TEST_TIMEOUT_SECONDS,
  KEY_EXPIRY_WARNING_DAYS,
  VAULT_AUDIT_ACTIONS,
} from '@surefy/contracts'
import type { ConnectionFailureCode, NotificationParams } from '@surefy/contracts'

import type { ModelSync } from './modelSync.js'
import type { CredentialRow, VaultRepository } from './vault.repository.js'
import type { VaultContext } from './vault.types.js'
import type { SecretCipher } from '@/core/crypto/index.js'
import type { Database, DbExecutor } from '@/core/database/index.js'
import type { Logger } from '@/core/logger/index.js'
import type { AuditRecorder } from '@/modules/audit/index.js'
import type { NotifyInput } from '@/modules/notifications/notifications.types.js'

export interface VaultMaintenanceDeps {
  db: Database
  secrets: SecretCipher
  ai: AiProviders
  repository: VaultRepository
  modelSync: ModelSync
  notifications: { notify(ctx: { orgId: string }, input: NotifyInput): Promise<unknown> }
  audit: AuditRecorder
  logger: Logger
  now?: () => Date
}

const DAY_MS = 86_400_000
const TABLE = 'vault_credentials'
const HEALTH_TIMEOUT_SECONDS = 10
const vc = vaultCredentials

type Probe =
  { ok: true; models: DiscoveredModel[] } | { ok: false; reasonCode: ConnectionFailureCode }

/**
 * The vault's recurring work (vault-and-models.md, §2–3): keys past their expiry become
 * `expired`, people are told 14 days before; models are synced daily; local servers that serve
 * enabled models are checked every 5 minutes. Each organization runs in its own transaction, and
 * one organization's failure never stops the others.
 */
export class VaultMaintenance {
  private readonly now: () => Date

  constructor(private readonly deps: VaultMaintenanceDeps) {
    this.now = deps.now ?? (() => new Date())
  }

  /** Daily: expire keys past `expires_at`, then warn about the ones expiring within 14 days. */
  async expireAndWarn(): Promise<{ expired: number; warned: number }> {
    const now = this.now()
    const expired = await this.deps.db.system('maintenance', async (tx) => {
      const rows = await tx
        .update(vc)
        .set({ status: 'expired', statusCheckedAt: now })
        .where(and(inArray(vc.status, ['active', 'error', 'rate_limited']), lte(vc.expiresAt, now)))
        .returning({ id: vc.id, organizationId: vc.organizationId, providerKey: vc.providerKey })
      for (const row of rows) {
        await this.deps.audit.record(
          tx,
          { orgId: row.organizationId, userId: null, via: 'system' },
          {
            action: VAULT_AUDIT_ACTIONS.VAULT_KEY_STATUS_CHANGED,
            target: { type: 'vault_credential', id: row.id },
            metadata: {
              changes: [{ field: 'status', from: 'active', to: 'expired' }],
              labels: { providerKey: row.providerKey },
            },
          },
        )
      }
      return rows.length
    })

    const horizon = new Date(now.getTime() + KEY_EXPIRY_WARNING_DAYS * DAY_MS)
    const expiring = await this.deps.db.system('maintenance', (tx) =>
      tx
        .select()
        .from(vc)
        .where(and(eq(vc.status, 'active'), gt(vc.expiresAt, now), lte(vc.expiresAt, horizon))),
    )
    let warned = 0
    for (const key of expiring) {
      const recipients = await this.recipientsOf(key)
      for (const userId of recipients) {
        const params: NotificationParams = {
          version: 1,
          name: key.name,
          providerKey: key.providerKey,
          expiresAt: key.expiresAt?.toISOString() ?? null,
        }
        await this.deps.notifications.notify(
          { orgId: key.organizationId },
          {
            userId,
            type: 'vault_key.expiring',
            params,
            target: { type: 'vault_credential', id: key.id },
            // once per key and expiry date, whatever the number of runs
            dedupeKey: `vault_key.expiring:${key.id}:${key.expiresAt?.toISOString().slice(0, 10) ?? ''}`,
          },
        )
        warned += 1
      }
    }
    return { expired, warned }
  }

  /** Daily: lists every organization's provider and server models again. */
  async syncAll(): Promise<{ organizations: number; failed: number }> {
    const orgIds = await this.organizationsWith(['ai_provider', 'local_server'])
    let failed = 0
    for (const orgId of orgIds) {
      try {
        await this.syncOrganization(orgId)
      } catch (error) {
        failed += 1
        this.deps.logger.error({ err: error, orgId }, 'vault model sync failed')
      }
    }
    return { organizations: orgIds.length, failed }
  }

  /** Every 5 minutes: local servers that serve enabled models; models follow the server's health. */
  async checkServers(): Promise<{ checked: number; down: number }> {
    const servers = await this.deps.db.system('maintenance', (tx) =>
      tx
        .select()
        .from(vc)
        .where(
          and(
            eq(vc.kind, 'local_server'),
            ne(vc.status, 'revoked'),
            exists(
              tx
                .select({ one: sql`1` })
                .from(vaultModels)
                .where(
                  and(
                    eq(vaultModels.organizationId, vc.organizationId),
                    eq(vaultModels.credentialId, vc.id),
                    eq(vaultModels.isEnabled, true),
                  ),
                ),
            ),
          ),
        ),
    )
    let down = 0
    for (const server of servers) {
      const probe = await this.probe(server, HEALTH_TIMEOUT_SECONDS)
      if (!probe.ok) down += 1
      await this.deps.db.tenant(server.organizationId, async (tx) => {
        await this.recordHealth(tx, server, probe)
        await this.deps.modelSync.setServerAvailability(tx, server.organizationId, server, probe.ok)
      })
    }
    return { checked: servers.length, down }
  }

  private async syncOrganization(orgId: string): Promise<void> {
    const ctx: VaultContext = {
      orgId,
      userId: null,
      teamIds: [],
      via: 'system',
      requestId: 'vault-sync',
    }
    const credentials = await this.deps.db.tenant(orgId, (tx) =>
      this.deps.repository.listActiveCredentials(tx, orgId, ['ai_provider', 'local_server']),
    )
    // provider models belong to the provider: one key lists them, the organization's first
    const providerKeys = new Map<string, CredentialRow>()
    for (const row of credentials) {
      if (row.kind !== 'ai_provider' || row.scope === 'personal') continue
      const current = providerKeys.get(row.providerKey)
      if (
        current === undefined ||
        (current.scope !== 'organization' && row.scope === 'organization')
      ) {
        providerKeys.set(row.providerKey, row)
      }
    }
    for (const key of providerKeys.values()) {
      const probe = await this.probe(key, CONNECTION_TEST_TIMEOUT_SECONDS)
      await this.deps.db.tenant(orgId, async (tx) => {
        await this.recordHealth(tx, key, probe)
        if (probe.ok)
          await this.deps.modelSync.storeProviderModels(tx, ctx, key.providerKey, probe.models)
      })
    }
    for (const server of credentials.filter((row) => row.kind === 'local_server')) {
      const probe = await this.probe(server, CONNECTION_TEST_TIMEOUT_SECONDS)
      await this.deps.db.tenant(orgId, async (tx) => {
        await this.recordHealth(tx, server, probe)
        if (probe.ok) await this.deps.modelSync.storeServerModels(tx, orgId, server, probe.models)
        else await this.deps.modelSync.setServerAvailability(tx, orgId, server, false)
      })
    }
  }

  /** Lists the models with the stored secret, decrypted for this call only. */
  private async probe(row: CredentialRow, timeoutSeconds: number): Promise<Probe> {
    const provider = this.deps.ai.get(row.providerKey)
    if (provider === undefined) return { ok: false, reasonCode: 'LOCAL_SERVER_UNREACHABLE' }
    const secret = await this.deps.db.tenant(row.organizationId, (tx) =>
      this.deps.secrets.decrypt(
        tx,
        { table: TABLE, id: row.id, organizationId: row.organizationId },
        row,
      ),
    )
    const credentials: AiProviderCredentials = {
      ...(secret === null ? {} : { apiKey: secret }),
      ...(row.baseUrl === null ? {} : { baseUrl: row.baseUrl }),
    }
    try {
      return {
        ok: true,
        models: await provider.listModels(credentials, AbortSignal.timeout(timeoutSeconds * 1000)),
      }
    } catch (error) {
      if (!isAiProviderError(error)) throw error
      return { ok: false, reasonCode: error.reasonCode }
    }
  }

  private async recordHealth(tx: DbExecutor, row: CredentialRow, probe: Probe): Promise<void> {
    if (probe.ok) {
      if (row.status !== 'active' && row.status !== 'expired') {
        await this.deps.repository.setStatus(tx, row.organizationId, row.id, 'active', null, true)
      }
      return
    }
    // an expired key stays expired until a person tests it again
    if (row.status === 'expired') return
    const status = probe.reasonCode === 'VAULT_QUOTA_EXCEEDED' ? 'rate_limited' : 'error'
    await this.deps.repository.setStatus(
      tx,
      row.organizationId,
      row.id,
      status,
      probe.reasonCode,
      false,
    )
  }

  /** A personal key warns its owner; a team or organization key warns the Admins and Owners. */
  private async recipientsOf(key: CredentialRow): Promise<string[]> {
    if (key.scope === 'personal') return key.ownerUserId === null ? [] : [key.ownerUserId]
    const rows = await this.deps.db.tenant(key.organizationId, (tx) =>
      tx
        .select({ userId: organizationMembers.userId })
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, key.organizationId),
            eq(organizationMembers.status, 'active'),
            inArray(organizationMembers.role, ['admin', 'owner']),
          ),
        ),
    )
    return rows.map((row) => row.userId)
  }

  private async organizationsWith(kinds: readonly string[]): Promise<string[]> {
    const rows = await this.deps.db.system('maintenance', (tx) =>
      tx
        .selectDistinct({ orgId: vc.organizationId })
        .from(vc)
        .where(and(inArray(vc.kind, [...kinds]), ne(vc.status, 'revoked'))),
    )
    return rows.map((row) => row.orgId)
  }
}
