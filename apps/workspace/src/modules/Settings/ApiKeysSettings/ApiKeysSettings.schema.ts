// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { apiKeyNameSchema, apiKeyScopeSchema } from '@surefy/contracts'

import { API_KEY_EXPIRY_CHOICES } from './ApiKeysSettings.constants'

/** Renaming changes the label only. */
export const renameApiKeySchema = z.object({ name: apiKeyNameSchema })
export type RenameApiKeyValues = z.input<typeof renameApiKeySchema>

/**
 * The create form. A chosen date must be a day after today; the service checks it again, as the
 * clock may differ.
 */
export const createApiKeySchema = z
  .object({
    name: apiKeyNameSchema,
    scopes: z.array(apiKeyScopeSchema).min(1),
    expiry: z.enum(API_KEY_EXPIRY_CHOICES),
    /** `YYYY-MM-DD`, only when `expiry` is `date`. */
    date: z.string(),
  })
  .refine((values) => values.expiry !== 'date' || values.date !== '', {
    path: ['date'],
  })
export type CreateApiKeyValues = z.input<typeof createApiKeySchema>
