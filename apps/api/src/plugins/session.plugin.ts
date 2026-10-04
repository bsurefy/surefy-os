// SPDX-License-Identifier: AGPL-3.0-only
import { fromNodeHeaders } from 'better-auth/node'
import fp from 'fastify-plugin'

import { RATE_LIMITS } from '@/constants/rateLimits.js'
import { AUTH_BASE_PATH, trustedOriginOf, type Auth } from '@/core/auth/index.js'
import { SESSION_APPS, type SessionApp } from '@surefy/contracts'

import type { Config } from '@/core/config/index.js'
import type { ActorContext } from '@/types/context.js'
import type { FastifyReply, FastifyRequest } from 'fastify'

/** Resolves `Authorization: Bearer sk_…` into the key's actor, or null (api_keys arrive in V1). */
export interface ApiKeyResolver {
  resolve(token: string, request: FastifyRequest): Promise<ActorContext | null>
}

export interface SessionPluginOptions {
  config: Config
  auth: Auth
  apiKeys?: ApiKeyResolver
}

const API_KEY_PREFIX = 'Bearer sk_'

/** Headers rebuilt for Better Auth rather than forwarded as the client sent them. */
const REBUILT_HEADERS = new Set([
  'host',
  'connection',
  'content-length',
  'transfer-encoding',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-forwarded-port',
])

/** Response headers Fastify computes itself. */
const SKIPPED_RESPONSE_HEADERS = new Set(['set-cookie', 'content-length', 'transfer-encoding'])

/**
 * The request as Better Auth sees it: the URL and `Host` of the app the person came through (the
 * validated host, otherwise the public API URL), the client IP Fastify resolved through the trusted
 * proxies, and the parsed JSON body re-serialized.
 */
export function toWebRequest(request: FastifyRequest, config: Config): Request {
  const origin = trustedOriginOf(config, request.host)
  const headers = new Headers()
  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined || REBUILT_HEADERS.has(key)) continue
    for (const item of Array.isArray(value) ? value : [value]) headers.append(key, item)
  }
  headers.set('host', new URL(origin).host)
  headers.set('x-forwarded-for', request.ip)
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD' && request.body != null
  return new Request(new URL(request.url, origin), {
    method: request.method,
    headers,
    ...(hasBody
      ? { body: typeof request.body === 'string' ? request.body : JSON.stringify(request.body) }
      : {}),
  })
}

async function sendWebResponse(reply: FastifyReply, response: Response): Promise<FastifyReply> {
  void reply.status(response.status)
  response.headers.forEach((value, key) => {
    if (!SKIPPED_RESPONSE_HEADERS.has(key)) void reply.header(key, value)
  })
  const cookies = response.headers.getSetCookie()
  if (cookies.length > 0) void reply.header('set-cookie', cookies)
  const body = await response.text()
  return reply.send(body.length > 0 ? body : null)
}

const toSessionApp = (value: unknown): SessionApp =>
  SESSION_APPS.find((app) => app === value) ?? 'workspace'

/**
 * Better Auth inside Fastify (authentication.md, §3): `/api/auth/*` is forwarded to its handler,
 * and every other request gets `request.auth` from the session cookie (or an API key) before the
 * guards of the access plugin run.
 */
export const sessionPlugin = fp<SessionPluginOptions>(
  (app, { config, auth, apiKeys }) => {
    app.decorateRequest('auth', null)

    app.route({
      method: ['GET', 'POST'],
      url: `${AUTH_BASE_PATH}/*`,
      config: { public: true, rateLimit: RATE_LIMITS.auth },
      schema: { hide: true },
      handler: async (request, reply) =>
        sendWebResponse(reply, await auth.handler(toWebRequest(request, config))),
    })

    app.addHook('onRequest', async (request, reply) => {
      if (request.url.startsWith(`${AUTH_BASE_PATH}/`)) return
      const authorization = request.headers.authorization
      if (authorization?.startsWith(API_KEY_PREFIX)) {
        const token = authorization.slice('Bearer '.length)
        request.auth = apiKeys === undefined ? null : await apiKeys.resolve(token, request)
        return
      }
      if (request.headers.cookie === undefined) return // no session cookie, nothing to look up
      const { headers, response } = await auth.api.getSession({
        headers: fromNodeHeaders(request.headers),
        returnHeaders: true,
      })
      // A session extended on this request (updateAge) comes back with a fresh cookie.
      const cookies = headers.getSetCookie()
      if (cookies.length > 0) void reply.header('set-cookie', cookies)
      if (response === null) return
      request.auth = {
        userId: response.user.id,
        requestId: request.id,
        via: 'user',
        session: {
          id: response.session.id,
          app: toSessionApp(response.session.app),
          createdAt: new Date(response.session.createdAt),
          expiresAt: new Date(response.session.expiresAt),
        },
        ip: request.ip,
        ...(request.headers['user-agent'] === undefined
          ? {}
          : { userAgent: request.headers['user-agent'] }),
      }
    })
    return Promise.resolve()
  },
  { name: 'session', dependencies: ['rateLimit'] },
)
