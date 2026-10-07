// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { SESSION_LENGTH_OPTIONS } from './SecuritySettings.constants'

/** The two-factor requirement and the session length, as the form holds them. */
export const securitySettingsSchema = z.object({
  require2fa: z.boolean(),
  sessionLength: z.enum(SESSION_LENGTH_OPTIONS),
})

export type SecuritySettingsValues = z.input<typeof securitySettingsSchema>
