// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { emailSchema, passwordSchema, personNameSchema } from '@surefy/contracts'

export const signUpSchema = z.object({
  name: personNameSchema,
  email: emailSchema,
  password: passwordSchema,
})

export type SignUpValues = z.input<typeof signUpSchema>
