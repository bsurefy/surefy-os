// SPDX-License-Identifier: AGPL-3.0-only
import { customType } from 'drizzle-orm/pg-core'

/**
 * pgvector `vector` without a fixed dimension, so one table holds embeddings of every size. A
 * generated `vector_dims()` column records the dimension next to it.
 */
export const vector = customType<{ data: number[]; driverData: string }>({
  dataType: () => 'vector',
  toDriver: (value) => JSON.stringify(value),
  fromDriver: (value) => value.slice(1, -1).split(',').map(Number),
})

export const tsvector = customType<{ data: string }>({ dataType: () => 'tsvector' })

/** Binary columns: ciphertext, IVs, auth tags and token hashes. */
export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
})
