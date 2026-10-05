// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { teamDescriptionSchema, teamNameSchema } from '@surefy/contracts'

/** Create and rename share one form: a name and an optional description. */
export const teamFormSchema = z.object({
  name: teamNameSchema,
  description: teamDescriptionSchema,
})

export type TeamFormValues = z.input<typeof teamFormSchema>
