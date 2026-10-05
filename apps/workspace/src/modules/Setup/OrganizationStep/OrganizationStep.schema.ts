// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import {
  emailSchema,
  localeSchema,
  organizationNameSchema,
  organizationSlugSchema,
  passwordSchema,
  personNameSchema,
} from '@surefy/contracts'

/** The "Organization & owner" fields; the contract schemas set the rules, no text of their own. */
export const organizationStepSchema = z.object({
  organizationName: organizationNameSchema,
  slug: organizationSlugSchema,
  /** Checked against the server's `SETUP_TOKEN` only when the install has one. */
  token: z.string().trim(),
  ownerName: personNameSchema,
  email: emailSchema,
  password: passwordSchema,
  locale: localeSchema,
})

export type OrganizationStepValues = z.input<typeof organizationStepSchema>
