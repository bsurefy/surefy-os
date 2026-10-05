// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import {
  baseUrlSchema,
  credentialNameSchema,
  LOCAL_SERVER_PROVIDER_KEYS,
  secretSchema,
} from '@surefy/contracts'

import { KEY_SCOPE } from '../../Vault.constants'

/** Add local server: type, label, address, an optional key, and who may use it (team scope needs a team). */
export const addServerFormSchema = z.object({
  providerKey: z.enum(LOCAL_SERVER_PROVIDER_KEYS),
  name: credentialNameSchema,
  baseUrl: baseUrlSchema,
  secret: z.union([z.literal(''), secretSchema]),
  scope: z.enum([KEY_SCOPE.ORGANIZATION, KEY_SCOPE.TEAM]),
  teamId: z.string(),
})

export type AddServerFormValues = z.input<typeof addServerFormSchema>
