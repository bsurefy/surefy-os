// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { passwordSchema } from '@surefy/contracts'

export const resetPasswordSchema = z
  .object({ password: passwordSchema, confirmPassword: z.string() })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'custom.passwordsMismatch',
    path: ['confirmPassword'],
  })

export type ResetPasswordValues = z.input<typeof resetPasswordSchema>
