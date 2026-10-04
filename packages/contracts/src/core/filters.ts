// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

/** Most values one multi-value filter accepts. */
export const FILTER_VALUES_MAX = 20

/**
 * A filter that repeats its key (`?status=active&status=paused`, api.md §5): one value or several
 * arrive, the handler always gets an array. Absent means "no filter".
 */
export const multiValueQuery = <T extends z.ZodType>(value: T) =>
  z
    .union([value, z.array(value).min(1).max(FILTER_VALUES_MAX)])
    .transform((parsed): z.output<T>[] => (Array.isArray(parsed) ? parsed : [parsed]))
    .optional()

/** `?q=`: free-text search on list endpoints. */
export const searchQuery = z.string().trim().min(1).max(200).optional()
