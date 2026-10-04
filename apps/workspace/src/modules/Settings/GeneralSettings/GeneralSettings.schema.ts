// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { localeSchema, organizationNameSchema, organizationSlugSchema } from '@surefy/contracts'

import { isSupportedTimeZone } from './GeneralSettings.utils'

/** The fields of Settings › General; the contract schemas set the rules, no text of their own. */
export const generalSettingsSchema = z.object({
  name: organizationNameSchema,
  slug: organizationSlugSchema,
  timezone: z.string().refine(isSupportedTimeZone, { message: 'invalidValue' }),
  defaultLocale: localeSchema,
})

export type GeneralSettingsValues = z.input<typeof generalSettingsSchema>
