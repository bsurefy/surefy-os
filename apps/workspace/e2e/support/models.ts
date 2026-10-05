// SPDX-License-Identifier: AGPL-3.0-only
import { callApi, currentOrgId } from './api'
import { EMBED_MODEL_ID, embedServerUrl, modelServerUrl, STUB_MODEL_ID } from './env'

import type { Page } from '@playwright/test'

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
      name: 'E2E model server',
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
