// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import {
  connectionTestDtoSchema,
  connectionTestInputSchema,
  createCredentialInputSchema,
  createLocalServerInputSchema,
  createPersonalCredentialInputSchema,
  credentialDtoSchema,
  credentialImpactDtoSchema,
  credentialImpactQuerySchema,
  credentialParamsSchema,
  listCredentialsQuerySchema,
  listModelAccessQuerySchema,
  listMyCredentialsQuerySchema,
  listUsableModelsQuerySchema,
  listVaultModelsQuerySchema,
  localServerParamsSchema,
  localServerSyncDtoSchema,
  modelAccessEntryDtoSchema,
  modelAccessRuleDtoSchema,
  modelImpactDtoSchema,
  modelImpactQuerySchema,
  modelParamsSchema,
  okResponse,
  orgParamsSchema,
  pageResponse,
  providerCardDtoSchema,
  setModelAccessInputSchema,
  updateCredentialInputSchema,
  updateVaultModelInputSchema,
  updateVaultSettingsInputSchema,
  usableModelDtoSchema,
  vaultModelDtoSchema,
  vaultSettingsDtoSchema,
} from '@surefy/contracts'

const TAGS = ['vault']

// ── Providers and keys ──────────────────────────────────────────────────────────────────────────

export const listProvidersRoute = {
  tags: TAGS,
  summary: 'The provider cards: connected, error, rate limited, expiring, not connected',
  params: orgParamsSchema,
  response: { 200: okResponse(z.array(providerCardDtoSchema)) },
}

export const listCredentialsRoute = {
  tags: TAGS,
  summary: 'Organization and team keys and local servers',
  params: orgParamsSchema,
  querystring: listCredentialsQuerySchema,
  response: { 200: pageResponse(credentialDtoSchema) },
}

export const createCredentialRoute = {
  tags: TAGS,
  summary: 'Add an organization or team key; it is stored only when its connection test passes',
  params: orgParamsSchema,
  body: createCredentialInputSchema,
  response: { 201: okResponse(credentialDtoSchema) },
}

export const testConnectionRoute = {
  tags: TAGS,
  summary: 'Try a key or a server before saving it',
  params: orgParamsSchema,
  body: connectionTestInputSchema,
  response: { 200: okResponse(connectionTestDtoSchema) },
}

export const getCredentialRoute = {
  tags: TAGS,
  summary: 'Get a key or a local server',
  params: credentialParamsSchema,
  response: { 200: okResponse(credentialDtoSchema) },
}

export const updateCredentialRoute = {
  tags: TAGS,
  summary: 'Rename a key, set its expiry, or change a local server address',
  params: credentialParamsSchema,
  body: updateCredentialInputSchema,
  response: { 200: okResponse(credentialDtoSchema) },
}

export const credentialImpactRoute = {
  tags: TAGS,
  summary: 'What a revoke or switch affects',
  params: credentialParamsSchema,
  querystring: credentialImpactQuerySchema,
  response: { 200: okResponse(credentialImpactDtoSchema) },
}

export const testCredentialRoute = {
  tags: TAGS,
  summary: 'Test a stored key and record its health',
  params: credentialParamsSchema,
  response: { 200: okResponse(connectionTestDtoSchema) },
}

export const makePrimaryRoute = {
  tags: TAGS,
  summary: 'Switch traffic to this key (rotation step 2)',
  params: credentialParamsSchema,
  response: { 200: okResponse(credentialDtoSchema) },
}

export const revokeCredentialRoute = {
  tags: TAGS,
  summary: 'Revoke a key: its secret is deleted at once',
  params: credentialParamsSchema,
  response: { 200: okResponse(credentialDtoSchema) },
}

// ── Local servers ───────────────────────────────────────────────────────────────────────────────

export const listLocalServersRoute = {
  tags: TAGS,
  summary: 'Local model servers',
  params: orgParamsSchema,
  querystring: listMyCredentialsQuerySchema,
  response: { 200: pageResponse(credentialDtoSchema) },
}

export const createLocalServerRoute = {
  tags: TAGS,
  summary: 'Connect a local server; its models are stored disabled',
  params: orgParamsSchema,
  body: createLocalServerInputSchema,
  response: { 201: okResponse(credentialDtoSchema) },
}

export const deleteLocalServerRoute = {
  tags: TAGS,
  summary: 'Remove a local server and its models',
  params: localServerParamsSchema,
}

export const localServerImpactRoute = {
  tags: TAGS,
  summary: 'What removing a local server affects',
  params: localServerParamsSchema,
  response: { 200: okResponse(credentialImpactDtoSchema) },
}

export const syncLocalServerRoute = {
  tags: TAGS,
  summary: 'List the models of a local server again',
  params: localServerParamsSchema,
  response: { 200: okResponse(localServerSyncDtoSchema) },
}

// ── Personal keys ───────────────────────────────────────────────────────────────────────────────

export const listMyCredentialsRoute = {
  tags: TAGS,
  summary: 'Your personal keys',
  params: orgParamsSchema,
  querystring: listMyCredentialsQuerySchema,
  response: { 200: pageResponse(credentialDtoSchema) },
}

export const createMyCredentialRoute = {
  tags: TAGS,
  summary: 'Add a personal key, when the access policy allows personal keys',
  params: orgParamsSchema,
  body: createPersonalCredentialInputSchema,
  response: { 201: okResponse(credentialDtoSchema) },
}

// ── Models ──────────────────────────────────────────────────────────────────────────────────────

const MODELS_TAGS = ['models']

export const listUsableModelsRoute = {
  tags: MODELS_TAGS,
  summary: 'The models you may use (the model picker)',
  params: orgParamsSchema,
  querystring: listUsableModelsQuerySchema,
  response: { 200: pageResponse(usableModelDtoSchema) },
}

export const listVaultModelsRoute = {
  tags: MODELS_TAGS,
  summary: 'Every model the organization can call',
  params: orgParamsSchema,
  querystring: listVaultModelsQuerySchema,
  response: { 200: pageResponse(vaultModelDtoSchema) },
}

export const getVaultModelRoute = {
  tags: MODELS_TAGS,
  summary: 'Get a model',
  params: modelParamsSchema,
  response: { 200: okResponse(vaultModelDtoSchema) },
}

export const updateVaultModelRoute = {
  tags: MODELS_TAGS,
  summary: 'Enable or disable a model, and set who may use it',
  params: modelParamsSchema,
  body: updateVaultModelInputSchema,
  response: { 200: okResponse(vaultModelDtoSchema) },
}

export const modelImpactRoute = {
  tags: MODELS_TAGS,
  summary: 'What disabling a model or removing access affects',
  params: modelParamsSchema,
  querystring: modelImpactQuerySchema,
  response: { 200: okResponse(modelImpactDtoSchema) },
}

export const getModelAccessRoute = {
  tags: MODELS_TAGS,
  summary: 'Who may use a model',
  params: modelParamsSchema,
  response: { 200: okResponse(z.array(modelAccessRuleDtoSchema)) },
}

export const setModelAccessRoute = {
  tags: MODELS_TAGS,
  summary: 'Replace who may use a model; an empty list allows nobody',
  params: modelParamsSchema,
  body: setModelAccessInputSchema,
  response: { 200: okResponse(z.array(modelAccessRuleDtoSchema)) },
}

export const listModelAccessRoute = {
  tags: MODELS_TAGS,
  summary: 'Every model with who may use it (Model access tab and matrix)',
  params: orgParamsSchema,
  querystring: listModelAccessQuerySchema,
  response: { 200: pageResponse(modelAccessEntryDtoSchema) },
}

export const getVaultSettingsRoute = {
  tags: MODELS_TAGS,
  summary: 'The embedding model and the fallback order',
  params: orgParamsSchema,
  response: { 200: okResponse(vaultSettingsDtoSchema) },
}

export const updateVaultSettingsRoute = {
  tags: MODELS_TAGS,
  summary: 'Change the embedding model or the fallback order',
  params: orgParamsSchema,
  body: updateVaultSettingsInputSchema,
  response: { 200: okResponse(vaultSettingsDtoSchema) },
}
