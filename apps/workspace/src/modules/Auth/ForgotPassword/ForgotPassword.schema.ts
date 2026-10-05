// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { emailSchema } from '@surefy/contracts'

export const forgotPasswordSchema = z.object({ email: emailSchema })

export type ForgotPasswordValues = z.input<typeof forgotPasswordSchema>
