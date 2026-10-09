// SPDX-License-Identifier: AGPL-3.0-only
import { callApi, currentOrgId } from './api'
import { EMBED_MODEL_ID, embedServerUrl, modelServerUrl, STUB_MODEL_ID } from './env'

import type { Page } from '@playwright/test'

const STUB_SERVER_NAME = 'E2E model server'

interface VaultModel {
  id: string
  modelKey: string
  isEnabled: boolean
}

/**
 * Connects the stub model server (`modelServer.ts`) as the organization's local server and enables
 * its model for everyone, as an Admin would in the Vault. For specs that need answers; the Vault's
 * own screens are the vault spec's. Returns the model's key.
 */
export async function connectStubModel(page: Page): Promise<string> {
  const orgId = await currentOrgId(page)
  const vault = `/orgs/${orgId}/vault`
  const models = () => callApi<VaultModel[]>(page, 'GET', `${vault}/models?limit=100`)

  let model = (await models()).find((entry) => entry.modelKey.endsWith(STUB_MODEL_ID))
  if (!model) {
    await callApi(page, 'POST', `${vault}/local-servers`, {
      scope: 'organization',
      name: STUB_SERVER_NAME,
      providerKey: 'openai_compatible',
      baseUrl: `${modelServerUrl}/v1`,
    })
    model = (await models()).find((entry) => entry.modelKey.endsWith(STUB_MODEL_ID))
  }
  if (!model) throw new Error(`The stub server's model ${STUB_MODEL_ID} was not detected`)
  if (!model.isEnabled)
    await callApi(page, 'PATCH', `${vault}/models/${model.id}`, { isEnabled: true })
  return model.modelKey
}

/**
 * Connects the stub embedding model (`embedServerUrl`) as a local server, enables it and makes it
 * the organization's embedding model, as an Admin would in the Vault. Knowledge bases need one.
 * The size of its vectors is read from the server when it is added.
 */
export async function connectStubEmbedding(page: Page): Promise<string> {
  const orgId = await currentOrgId(page)
  const vault = `/orgs/${orgId}/vault`
  const models = () => callApi<VaultModel[]>(page, 'GET', `${vault}/models?limit=100`)

  let model = (await models()).find((entry) => entry.modelKey.endsWith(EMBED_MODEL_ID))
  if (!model) {
    await callApi(page, 'POST', `${vault}/local-servers`, {
      scope: 'organization',
      name: 'E2E embedding server',
      providerKey: 'openai_compatible',
      baseUrl: `${embedServerUrl}/v1`,
    })
    model = (await models()).find((entry) => entry.modelKey.endsWith(EMBED_MODEL_ID))
  }
  if (!model) throw new Error(`The stub server's embedding model ${EMBED_MODEL_ID} was not stored`)
  if (!model.isEnabled)
    await callApi(page, 'PATCH', `${vault}/models/${model.id}`, { isEnabled: true })
  await callApi(page, 'PUT', `${vault}/settings`, { embeddingModelId: model.id })
  return model.modelKey
}

/**
 * Removes the local server `connectStubModel` added, as an Admin would in the Vault. A spec that
 * connected the stub model calls it when it is done, so the specs that expect an organization
 * without a model (Chat, Vault) find it as setup left it.
 */
export async function removeStubModel(page: Page): Promise<void> {
  const orgId = await currentOrgId(page)
  const vault = `/orgs/${orgId}/vault`
  const servers = await callApi<{ id: string; name: string }[]>(
    page,
    'GET',
    `${vault}/local-servers`,
  )
  const server = servers.find((entry) => entry.name === STUB_SERVER_NAME)
  if (server) await callApi(page, 'DELETE', `${vault}/local-servers/${server.id}`)
}
