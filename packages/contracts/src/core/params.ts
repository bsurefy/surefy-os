// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

/** `:orgId` of every tenant route (`/api/v1/orgs/:orgId/…`). Domains extend it with their own ids. */
export const orgParamsSchema = z.object({ orgId: z.uuid() })
export type OrgParams = z.infer<typeof orgParamsSchema>
