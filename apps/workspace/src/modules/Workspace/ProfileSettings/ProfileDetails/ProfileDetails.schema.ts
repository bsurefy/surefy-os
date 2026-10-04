// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { personNameSchema } from '@surefy/contracts'

export const profileDetailsSchema = z.object({ name: personNameSchema })
export type ProfileDetailsValues = z.infer<typeof profileDetailsSchema>
