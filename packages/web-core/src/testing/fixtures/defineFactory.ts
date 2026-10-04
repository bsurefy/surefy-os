// SPDX-License-Identifier: AGPL-3.0-only
import type { z } from 'zod'

export interface Factory<Output, Input> {
  /** One valid object; only the given fields differ from the defaults. */
  (overrides?: Partial<Input>): Output
  /** `count` objects, each from its own sequence number. */
  many(count: number, overrides?: Partial<Input>): Output[]
  /** Starts the sequence over, so tests get the same IDs in the same order. */
  reset(): void
}

/**
 * A fixture factory bound to a contract schema: `build(sequence)` gives the defaults for the
 * n-th object (`id: \`agent_${sequence}\``), a test overrides the fields that matter, and the
 * result is parsed by the schema so a factory can never produce an invalid contract object.
 */
export function defineFactory<Schema extends z.ZodType>(
  schema: Schema,
  build: (sequence: number) => z.input<Schema>,
): Factory<z.output<Schema>, z.input<Schema>> {
  let sequence = 0

  const create = (overrides: Partial<z.input<Schema>> = {}): z.output<Schema> => {
    sequence += 1
    const defaults = build(sequence) as Record<string, unknown>
    return schema.parse({ ...defaults, ...overrides })
  }

  const factory = create as Factory<z.output<Schema>, z.input<Schema>>
  factory.many = (count, overrides) => Array.from({ length: count }, () => create(overrides))
  factory.reset = () => {
    sequence = 0
  }
  return factory
}

/** `prefix_1`, `prefix_2`…: IDs for fixtures that are not built by a factory. */
export function createIdSequence(prefix: string): () => string {
  let sequence = 0
  return () => {
    sequence += 1
    return `${prefix}_${sequence}`
  }
}
