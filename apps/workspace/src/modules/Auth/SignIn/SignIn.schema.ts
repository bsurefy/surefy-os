// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { emailSchema } from '@surefy/contracts'

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
})

export type SignInValues = z.input<typeof signInSchema>
