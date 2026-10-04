// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { passwordSchema, personNameSchema } from '@surefy/contracts'

/** The invited address comes from the invitation, so the form asks only for name and password. */
export const acceptInvitationSchema = z.object({
  name: personNameSchema,
  password: passwordSchema,
})

export type AcceptInvitationValues = z.input<typeof acceptInvitationSchema>
