// SPDX-License-Identifier: AGPL-3.0-only
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import fp from 'fastify-plugin'

import { LOCAL_FILES_PATH } from '@/integrations/storage/index.js'

import type { Config } from '@/core/config/index.js'

export interface SecurityPluginOptions {
  config: Config
}

/** The host of `API_PUBLIC_URL`: the only host that answers cross-origin browser requests. */
export const publicApiHost = (config: Config): string => new URL(config.api.publicUrl).host

/**
 * Security headers on every response, and CORS only on the public API host for the allow-listed
 * origins (api.md, §1). The web apps reach the API same-origin through their own proxies, so a
 * cross-origin request to those hosts gets no CORS headers at all.
 */
export const securityPlugin = fp<SecurityPluginOptions>(
  async (app, { config }) => {
    await app.register(helmet, {
      // The API serves JSON; the web apps set their own CSP. Scalar's docs page needs scripts.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-site' },
    })

    const apiHost = publicApiHost(config)
    const allowedOrigins = new Set(config.api.publicCorsOrigins)
    // Widget origins are configured per published agent and added to this check by the agents module.
    await app.register(cors, {
      delegator: (request, callback) => {
        const origin = request.headers.origin
        // a signed storage link carries its own authorization and no cookies, so any origin may use it
        const isSignedFile = new URL(request.url, 'http://localhost').pathname === LOCAL_FILES_PATH
        const allowed =
          request.host === apiHost &&
          origin !== undefined &&
          (isSignedFile || allowedOrigins.has(origin))
        callback(null, {
          origin: allowed ? origin : false,
          methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
          allowedHeaders: ['content-type', 'authorization', 'idempotency-key', 'x-request-id'],
          maxAge: 600,
        })
      },
    })
  },
  { name: 'security' },
)
