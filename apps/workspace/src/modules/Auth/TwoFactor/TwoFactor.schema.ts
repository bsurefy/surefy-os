// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

export const recoveryCodeSchema = z.object({ code: z.string().trim().min(1) })

export type RecoveryCodeValues = z.input<typeof recoveryCodeSchema>
