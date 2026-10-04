// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

export const PAGE_SIZE = { default: 25, max: 100 } as const

/** `?limit=&cursor=` on every list endpoint. Cursors are opaque; clients never build them. */
export const pageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(PAGE_SIZE.max).default(PAGE_SIZE.default),
  cursor: z.string().min(1).optional(),
})
export type PageQuery = z.infer<typeof pageQuery>

/** `?sort=createdAt` or `?sort=-createdAt`, restricted to the fields an endpoint allows. */
export const sortQuery = (fields: readonly [string, ...string[]]) =>
  z.enum([...fields, ...fields.map((field) => `-${field}`)] as [string, ...string[]]).optional()
