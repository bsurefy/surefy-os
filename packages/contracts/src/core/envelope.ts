// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

/** `{ data }`: every successful JSON response except lists (reply.ok / reply.created). */
export const okResponse = <T extends z.ZodType>(data: T) => z.object({ data })

/** `{ data: [...], meta: { nextCursor } }`: every list response (reply.page). */
export const pageResponse = <T extends z.ZodType>(item: T) =>
  z.object({ data: z.array(item), meta: z.object({ nextCursor: z.string().nullable() }) })

/** One field-level problem in an error response (validation errors, limits). */
export const errorDetailSchema = z.record(z.string(), z.unknown())

/** `{ error }`: every error response, built only by the API error handler. */
export const errorResponse = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
    details: z.array(errorDetailSchema),
  }),
})
export type ErrorResponse = z.infer<typeof errorResponse>

export interface Page<T> {
  data: T[]
  meta: { nextCursor: string | null }
}
