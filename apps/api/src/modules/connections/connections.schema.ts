// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import {
  completeOauthInputSchema,
  connectionCheckDtoSchema,
  connectionDtoSchema,
  connectionImpactDtoSchema,
  connectionParamsSchema,
  connectionProviderDtoSchema,
  createConnectionInputSchema,
  listConnectionsQuerySchema,
  oauthCompleteDtoSchema,
  oauthStartDtoSchema,
  okResponse,
  orgParamsSchema,
  pageResponse,
  reconnectConnectionInputSchema,
  startOauthInputSchema,
  updateConnectionInputSchema,
} from '@surefy/contracts'

const TAGS = ['connections']

export const listProvidersRoute = {
  tags: TAGS,
  summary: 'The apps the Add connection dialog offers on this install',
  params: orgParamsSchema,
  response: { 200: okResponse(z.array(connectionProviderDtoSchema)) },
}

export const listConnectionsRoute = {
  tags: TAGS,
  summary: 'List connections: every one for Admins and Owners, the caller’s own otherwise',
  params: orgParamsSchema,
  querystring: listConnectionsQuerySchema,
  response: { 200: pageResponse(connectionDtoSchema) },
}

export const createConnectionRoute = {
  tags: TAGS,
  summary: 'Add a connection that signs in without a redirect; the check runs before it is stored',
  params: orgParamsSchema,
  body: createConnectionInputSchema,
  response: { 201: okResponse(connectionDtoSchema) },
}

export const startOauthRoute = {
  tags: TAGS,
  summary: 'Begin an OAuth sign-in for a new connection or a reconnect',
  params: orgParamsSchema,
  body: startOauthInputSchema,
  response: { 200: okResponse(oauthStartDtoSchema) },
}

export const completeOauthRoute = {
  tags: TAGS,
  summary: 'Finish an OAuth sign-in with what the callback page received',
  params: orgParamsSchema,
  body: completeOauthInputSchema,
  response: { 200: okResponse(oauthCompleteDtoSchema) },
}

export const getConnectionRoute = {
  tags: TAGS,
  summary: 'Get a connection',
  params: connectionParamsSchema,
  response: { 200: okResponse(connectionDtoSchema) },
}

export const updateConnectionRoute = {
  tags: TAGS,
  summary: 'Rename a connection or edit the address of a self-hosted app',
  params: connectionParamsSchema,
  body: updateConnectionInputSchema,
  response: { 200: okResponse(connectionDtoSchema) },
}

export const connectionImpactRoute = {
  tags: TAGS,
  summary: 'What stops working when the connection is disconnected',
  params: connectionParamsSchema,
  response: { 200: okResponse(connectionImpactDtoSchema) },
}

export const reconnectConnectionRoute = {
  tags: TAGS,
  summary: 'Replace the credentials of a connection that does not use an OAuth redirect',
  params: connectionParamsSchema,
  body: reconnectConnectionInputSchema,
  response: { 200: okResponse(connectionDtoSchema) },
}

export const testConnectionRoute = {
  tags: TAGS,
  summary: 'Check a connection now and record its status',
  params: connectionParamsSchema,
  response: { 200: okResponse(connectionCheckDtoSchema) },
}

export const revokeConnectionRoute = {
  tags: TAGS,
  summary: 'Disconnect: the secret is deleted at once and cannot come back',
  params: connectionParamsSchema,
  response: { 200: okResponse(connectionDtoSchema) },
}
