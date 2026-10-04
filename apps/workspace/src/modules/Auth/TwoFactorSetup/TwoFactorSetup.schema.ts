// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

export const confirmPasswordSchema = z.object({ password: z.string().min(1) })

export type ConfirmPasswordValues = z.input<typeof confirmPasswordSchema>
