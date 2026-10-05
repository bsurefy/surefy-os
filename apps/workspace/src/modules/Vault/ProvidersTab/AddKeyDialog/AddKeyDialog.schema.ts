// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import {
  baseUrlSchema,
  credentialNameSchema,
  providerKeySchema,
  secretSchema,
} from '@surefy/contracts'

import { KEY_SCOPE } from '../../Vault.constants'

/**
 * Add API key: provider, label, secret, an optional address (proxies) and expiry, and who may use
 * it. A team scope also needs a team; the dialog keeps Save off until it is chosen.
 */
export const addKeyFormSchema = z.object({
  providerKey: providerKeySchema,
  name: credentialNameSchema,
  secret: secretSchema,
  baseUrl: z.union([z.literal(''), baseUrlSchema]),
  scope: z.enum([KEY_SCOPE.ORGANIZATION, KEY_SCOPE.TEAM]),
  teamId: z.string(),
  expiresAt: z.string(),
})

export type AddKeyFormValues = z.input<typeof addKeyFormSchema>
