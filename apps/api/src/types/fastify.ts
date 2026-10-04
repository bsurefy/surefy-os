// SPDX-License-Identifier: AGPL-3.0-only
import type {
  ContextConfigDefault,
  FastifyReply,
  FastifyRequest,
  FastifySchema,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault,
  RouteGenericInterface,
} from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'

/** A request typed from its route's Zod schema: `params`, `query` and `body`. */
export type ZodRequest<S extends FastifySchema> = FastifyRequest<
  RouteGenericInterface,
  RawServerDefault,
  RawRequestDefaultExpression,
  S,
  ZodTypeProvider
>

/** A reply typed from its route's Zod response schema. */
export type ZodReply<S extends FastifySchema> = FastifyReply<
  RouteGenericInterface,
  RawServerDefault,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  ContextConfigDefault,
  S,
  ZodTypeProvider
>

declare module 'fastify' {
  interface FastifyContextConfig {
    /** Explicit opt-out of the access guards (health, setup, the auth handler). */
    public?: boolean
  }

  interface FastifyReply {
    /** `200 { data }` */
    ok(data: unknown): FastifyReply
    /** `201 { data }` */
    created(data: unknown): FastifyReply
    /** `200 { data: [...], meta: { nextCursor } }` */
    page(items: readonly unknown[], nextCursor: string | null): FastifyReply
    /** `204`, no body */
    noContent(): FastifyReply
  }
}
