// SPDX-License-Identifier: AGPL-3.0-only
import type { Feature, Permission } from '@surefy/contracts'

import type { ActorContext, TenantContext } from './context.js'
import type {
  ContextConfigDefault,
  FastifyReply,
  FastifyRequest,
  FastifySchema,
  preHandlerAsyncHookHandler,
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

/** `app.requireFeature(feature, { allowReadOnly })`: read routes keep working in a license's grace days. */
export interface RequireFeatureOptions {
  allowReadOnly?: boolean
}

declare module 'fastify' {
  interface FastifyInstance {
    /** Guard for `/api/v1/me/…`: a signed-in user session (session plugin). */
    authenticate(): preHandlerAsyncHookHandler
    /** Guard for `/api/v1/orgs/:orgId/…`: membership of `:orgId` and `permission`; sets `request.tenant`. */
    authorize(permission: Permission): preHandlerAsyncHookHandler
    /** Guard for feature-gated routes, always after `authorize()`: `403 FEATURE_NOT_AVAILABLE`. */
    requireFeature(feature: Feature, options?: RequireFeatureOptions): preHandlerAsyncHookHandler
  }

  interface FastifyRequest {
    /** Who is calling, set by the session plugin: a user session, an API key, or null. */
    auth: ActorContext | null
    /**
     * The verified organization context, set by `app.authorize()`. Declared non-null: the access
     * plugin refuses at boot an `:orgId` route without `app.authorize()`.
     */
    tenant: TenantContext
  }

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
