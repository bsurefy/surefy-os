// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import {
  connectionBaseUrlSchema,
  connectionNameSchema,
  connectionSecretValueSchema,
} from '@surefy/contracts'

import { SIGN_IN_METHOD } from './ConnectionsSettings.constants'

import type { SignInMethod } from './ConnectionsSettings.constants'

const EXTRA_VALUE_MAX = 1000
const text = z.string().trim()

/** An extra field the app asks for (WhatsApp's phone number ID). */
export interface ExtraField {
  key: string
  isRequired: boolean
}

export interface SignInSchemaOptions {
  method: SignInMethod
  /** The app is self-hosted or custom: the address is required. */
  requiresBaseUrl: boolean
  extraFields: readonly ExtraField[]
  /** Reconnect keeps the name and the address; only the credentials are asked for. */
  isReconnect?: boolean
}

/**
 * The sign-in step of Add connection, and the credentials of Reconnect. One flat set of fields; the
 * ones the chosen way of signing in does not use stay empty and unchecked. The same field names
 * feed `buildCreateInput`.
 */
export function createSignInSchema({
  method,
  requiresBaseUrl,
  extraFields,
  isReconnect = false,
}: SignInSchemaOptions) {
  const uses = (...methods: SignInMethod[]) => methods.includes(method)
  const required = connectionSecretValueSchema
  return z.object({
    // OAuth connections default their name to the account's
    name: method === SIGN_IN_METHOD.OAUTH || isReconnect ? text.max(100) : connectionNameSchema,
    baseUrl: requiresBaseUrl && !isReconnect ? connectionBaseUrlSchema : text,
    secret: uses(SIGN_IN_METHOD.API_KEY, SIGN_IN_METHOD.BEARER) ? required : text,
    username: uses(SIGN_IN_METHOD.BASIC) ? required : text,
    password: uses(SIGN_IN_METHOD.BASIC) ? required : text,
    tokenUrl: uses(SIGN_IN_METHOD.CLIENT_CREDENTIALS) ? connectionBaseUrlSchema : text,
    clientId: uses(SIGN_IN_METHOD.CLIENT_CREDENTIALS) ? required : text,
    clientSecret: uses(SIGN_IN_METHOD.CLIENT_CREDENTIALS) ? required : text,
    /** Space or comma separated. */
    oauthScopes: text,
    extra: z.object(
      Object.fromEntries(
        extraFields.map(({ key, isRequired }) => [
          key,
          isRequired ? text.min(1).max(EXTRA_VALUE_MAX) : text.max(EXTRA_VALUE_MAX),
        ]),
      ),
    ),
  })
}

export type SignInValues = z.input<ReturnType<typeof createSignInSchema>>

/** Renaming changes the label; custom APIs and MCP servers also change the address. */
export function createRenameSchema(hasAddress: boolean) {
  return z.object({
    name: connectionNameSchema,
    baseUrl: hasAddress ? connectionBaseUrlSchema : text,
  })
}
export type RenameConnectionValues = z.input<ReturnType<typeof createRenameSchema>>
