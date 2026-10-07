// SPDX-License-Identifier: AGPL-3.0-only
import { PERMISSIONS } from '@surefy/contracts'

import {
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

import type { VaultController } from './vault.controller.js'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

/**
 * Vault routes (vault.md, §5 Permissions): Builders read, Admins and Owners manage; everyone may
 * see the models they may use and, when allowed, add personal keys.
 */
export function vaultRoutes(c: VaultController): FastifyPluginAsyncZod {
  return (app) => {
    const read = app.authorize(PERMISSIONS.VAULT_READ)
    const manage = app.authorize(PERMISSIONS.VAULT_MANAGE)
    const self = app.authorize(PERMISSIONS.MEMBERS_MANAGE_SELF)
    const chat = app.authorize(PERMISSIONS.CHAT_USE)
    const vault = '/orgs/:orgId/vault'
    const credential = `${vault}/credentials/:credentialId`
    const server = `${vault}/local-servers/:serverId`
    const model = `${vault}/models/:modelId`

    app.get(`${vault}/providers`, { schema: listProvidersRoute, preHandler: read }, c.providers)
    app.get(
      `${vault}/credentials`,
      { schema: listCredentialsRoute, preHandler: read },
      c.listCredentials,
    )
    app.post(
      `${vault}/credentials`,
      { schema: createCredentialRoute, preHandler: manage },
      c.createCredential,
    )
    // personal keys are tested too; the service limits what someone without vault:manage may test
    app.post(
      `${vault}/connection-tests`,
      { schema: testConnectionRoute, preHandler: self },
      c.testConnection,
    )
    app.get(credential, { schema: getCredentialRoute, preHandler: read }, c.getCredential)
    app.patch(credential, { schema: updateCredentialRoute, preHandler: manage }, c.updateCredential)
    app.get(
      `${credential}/impact`,
      { schema: credentialImpactRoute, preHandler: manage },
      c.credentialImpact,
    )
    app.post(
      `${credential}/test`,
      { schema: testCredentialRoute, preHandler: manage },
      c.testCredential,
    )
    app.post(
      `${credential}/make-primary`,
      { schema: makePrimaryRoute, preHandler: manage },
      c.makePrimary,
    )
    app.post(
      `${credential}/revoke`,
      { schema: revokeCredentialRoute, preHandler: manage },
      c.revoke,
    )

    app.get(
      `${vault}/local-servers`,
      { schema: listLocalServersRoute, preHandler: read },
      c.listLocalServers,
    )
    app.post(
      `${vault}/local-servers`,
      { schema: createLocalServerRoute, preHandler: manage },
      c.createLocalServer,
    )
    app.delete(server, { schema: deleteLocalServerRoute, preHandler: manage }, c.deleteLocalServer)
    app.get(
      `${server}/impact`,
      { schema: localServerImpactRoute, preHandler: manage },
      c.localServerImpact,
    )
    app.post(
      `${server}/sync`,
      { schema: syncLocalServerRoute, preHandler: manage },
      c.syncLocalServer,
    )

    app.get(
      `${vault}/my-credentials`,
      { schema: listMyCredentialsRoute, preHandler: self },
      c.listMyCredentials,
    )
    app.post(
      `${vault}/my-credentials`,
      { schema: createMyCredentialRoute, preHandler: self },
      c.createMyCredential,
    )

    app.get(
      '/orgs/:orgId/models',
      { schema: listUsableModelsRoute, preHandler: chat },
      c.listUsableModels,
    )
    app.get(`${vault}/models`, { schema: listVaultModelsRoute, preHandler: read }, c.listModels)
    app.get(model, { schema: getVaultModelRoute, preHandler: read }, c.getModel)
    app.patch(model, { schema: updateVaultModelRoute, preHandler: manage }, c.updateModel)
    app.get(`${model}/impact`, { schema: modelImpactRoute, preHandler: manage }, c.modelImpact)
    app.get(`${model}/access`, { schema: getModelAccessRoute, preHandler: read }, c.getModelAccess)
    app.put(
      `${model}/access`,
      { schema: setModelAccessRoute, preHandler: manage },
      c.setModelAccess,
    )
    app.get(
      `${vault}/model-access`,
      { schema: listModelAccessRoute, preHandler: read },
      c.listModelAccess,
    )
    app.get(`${vault}/settings`, { schema: getVaultSettingsRoute, preHandler: read }, c.getSettings)
    app.put(
      `${vault}/settings`,
      { schema: updateVaultSettingsRoute, preHandler: manage },
      c.updateSettings,
    )
    return Promise.resolve()
  }
}
