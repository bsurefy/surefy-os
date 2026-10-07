// SPDX-License-Identifier: AGPL-3.0-only
import { PERMISSIONS } from '@surefy/contracts'

import type { ModelsService } from './models.service.js'
import type {
  createCredentialRoute,
  createLocalServerRoute,
  createMyCredentialRoute,
  credentialImpactRoute,
  deleteLocalServerRoute,
  getCredentialRoute,
  getModelAccessRoute,
  getVaultModelRoute,
  getVaultSettingsRoute,
  listCredentialsRoute,
  listLocalServersRoute,
  listModelAccessRoute,
  listMyCredentialsRoute,
  listProvidersRoute,
  listUsableModelsRoute,
  listVaultModelsRoute,
  localServerImpactRoute,
  makePrimaryRoute,
  modelImpactRoute,
  revokeCredentialRoute,
  setModelAccessRoute,
  syncLocalServerRoute,
  testConnectionRoute,
  testCredentialRoute,
  updateCredentialRoute,
  updateVaultModelRoute,
  updateVaultSettingsRoute,
} from './vault.schema.js'
import type { VaultService } from './vault.service.js'
import type { ZodReply, ZodRequest } from '@/types/fastify.js'
import type { FastifySchema } from 'fastify'

type R<T extends FastifySchema> = ZodRequest<T>
type P<T extends FastifySchema> = ZodReply<T>

export class VaultController {
  constructor(
    private readonly vault: VaultService,
    private readonly models: ModelsService,
  ) {}

  // ── Providers and keys ────────────────────────────────────────────────────────────────────────

  providers = async (
    request: R<typeof listProvidersRoute>,
    reply: P<typeof listProvidersRoute>,
  ) => {
    reply.ok(await this.vault.providers(request.tenant))
  }

  listCredentials = async (
    request: R<typeof listCredentialsRoute>,
    reply: P<typeof listCredentialsRoute>,
  ) => {
    const { items, nextCursor } = await this.vault.listCredentials(request.tenant, request.query)
    reply.page(items, nextCursor)
  }

  createCredential = async (
    request: R<typeof createCredentialRoute>,
    reply: P<typeof createCredentialRoute>,
  ) => {
    reply.created(await this.vault.createCredential(request.tenant, request.body))
  }

  testConnection = async (
    request: R<typeof testConnectionRoute>,
    reply: P<typeof testConnectionRoute>,
  ) => {
    const canManage = request.tenant.access.permissions.includes(PERMISSIONS.VAULT_MANAGE)
    reply.ok(await this.vault.testConnection(request.tenant, request.body, canManage))
  }

  getCredential = async (
    request: R<typeof getCredentialRoute>,
    reply: P<typeof getCredentialRoute>,
  ) => {
    reply.ok(await this.vault.getCredential(request.tenant, request.params.credentialId))
  }

  updateCredential = async (
    request: R<typeof updateCredentialRoute>,
    reply: P<typeof updateCredentialRoute>,
  ) => {
    reply.ok(
      await this.vault.updateCredential(request.tenant, request.params.credentialId, request.body),
    )
  }

  credentialImpact = async (
    request: R<typeof credentialImpactRoute>,
    reply: P<typeof credentialImpactRoute>,
  ) => {
    reply.ok(await this.vault.impact(request.tenant, request.params.credentialId))
  }

  testCredential = async (
    request: R<typeof testCredentialRoute>,
    reply: P<typeof testCredentialRoute>,
  ) => {
    reply.ok(await this.vault.testCredential(request.tenant, request.params.credentialId))
  }

  makePrimary = async (request: R<typeof makePrimaryRoute>, reply: P<typeof makePrimaryRoute>) => {
    reply.ok(await this.vault.makePrimary(request.tenant, request.params.credentialId))
  }

  revoke = async (
    request: R<typeof revokeCredentialRoute>,
    reply: P<typeof revokeCredentialRoute>,
  ) => {
    reply.ok(await this.vault.revoke(request.tenant, request.params.credentialId))
  }

  // ── Local servers ─────────────────────────────────────────────────────────────────────────────

  listLocalServers = async (
    request: R<typeof listLocalServersRoute>,
    reply: P<typeof listLocalServersRoute>,
  ) => {
    const { items, nextCursor } = await this.vault.listLocalServers(request.tenant, request.query)
    reply.page(items, nextCursor)
  }

  createLocalServer = async (
    request: R<typeof createLocalServerRoute>,
    reply: P<typeof createLocalServerRoute>,
  ) => {
    reply.created(await this.vault.createLocalServer(request.tenant, request.body))
  }

  deleteLocalServer = async (
    request: R<typeof deleteLocalServerRoute>,
    reply: P<typeof deleteLocalServerRoute>,
  ) => {
    await this.vault.deleteLocalServer(request.tenant, request.params.serverId)
    reply.noContent()
  }

  localServerImpact = async (
    request: R<typeof localServerImpactRoute>,
    reply: P<typeof localServerImpactRoute>,
  ) => {
    reply.ok(await this.vault.impact(request.tenant, request.params.serverId))
  }

  syncLocalServer = async (
    request: R<typeof syncLocalServerRoute>,
    reply: P<typeof syncLocalServerRoute>,
  ) => {
    reply.ok(await this.vault.syncLocalServer(request.tenant, request.params.serverId))
  }

  // ── Personal keys ─────────────────────────────────────────────────────────────────────────────

  listMyCredentials = async (
    request: R<typeof listMyCredentialsRoute>,
    reply: P<typeof listMyCredentialsRoute>,
  ) => {
    const { items, nextCursor } = await this.vault.listMyCredentials(request.tenant, request.query)
    reply.page(items, nextCursor)
  }

  createMyCredential = async (
    request: R<typeof createMyCredentialRoute>,
    reply: P<typeof createMyCredentialRoute>,
  ) => {
    reply.created(await this.vault.createPersonalCredential(request.tenant, request.body))
  }

  // ── Models ────────────────────────────────────────────────────────────────────────────────────

  listUsableModels = async (
    request: R<typeof listUsableModelsRoute>,
    reply: P<typeof listUsableModelsRoute>,
  ) => {
    const { items, nextCursor } = await this.models.listUsable(
      request.tenant,
      request.tenant.access.allowedModelIds,
      request.query,
    )
    reply.page(items, nextCursor)
  }

  listModels = async (
    request: R<typeof listVaultModelsRoute>,
    reply: P<typeof listVaultModelsRoute>,
  ) => {
    const { items, nextCursor } = await this.models.listModels(request.tenant, request.query)
    reply.page(items, nextCursor)
  }

  getModel = async (request: R<typeof getVaultModelRoute>, reply: P<typeof getVaultModelRoute>) => {
    reply.ok(await this.models.getModel(request.tenant, request.params.modelId))
  }

  updateModel = async (
    request: R<typeof updateVaultModelRoute>,
    reply: P<typeof updateVaultModelRoute>,
  ) => {
    reply.ok(await this.models.updateModel(request.tenant, request.params.modelId, request.body))
  }

  modelImpact = async (request: R<typeof modelImpactRoute>, reply: P<typeof modelImpactRoute>) => {
    reply.ok(await this.models.impact(request.tenant, request.params.modelId))
  }

  getModelAccess = async (
    request: R<typeof getModelAccessRoute>,
    reply: P<typeof getModelAccessRoute>,
  ) => {
    reply.ok(await this.models.getAccess(request.tenant, request.params.modelId))
  }

  setModelAccess = async (
    request: R<typeof setModelAccessRoute>,
    reply: P<typeof setModelAccessRoute>,
  ) => {
    reply.ok(await this.models.setAccess(request.tenant, request.params.modelId, request.body))
  }

  listModelAccess = async (
    request: R<typeof listModelAccessRoute>,
    reply: P<typeof listModelAccessRoute>,
  ) => {
    const { items, nextCursor } = await this.models.listAccess(request.tenant, request.query)
    reply.page(items, nextCursor)
  }

  getSettings = async (
    request: R<typeof getVaultSettingsRoute>,
    reply: P<typeof getVaultSettingsRoute>,
  ) => {
    reply.ok(await this.models.getSettings(request.tenant))
  }

  updateSettings = async (
    request: R<typeof updateVaultSettingsRoute>,
    reply: P<typeof updateVaultSettingsRoute>,
  ) => {
    reply.ok(await this.models.updateSettings(request.tenant, request.body))
  }
}
