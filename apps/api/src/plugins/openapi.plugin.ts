// SPDX-License-Identifier: AGPL-3.0-only
import swagger from '@fastify/swagger'
import scalar from '@scalar/fastify-api-reference'
import fp from 'fastify-plugin'
import { jsonSchemaTransform, jsonSchemaTransformObject } from 'fastify-type-provider-zod'

import type { Config } from '@/core/config/index.js'

export const API_DOCS_PATH = '/api/docs'

export interface OpenapiPluginOptions {
  config: Config
}

/**
 * Builds the OpenAPI document from the routes' Zod schemas and serves it with Scalar at
 * `/api/docs`. Always on in development; `API_DOCS_ENABLED` controls production installs.
 */
export const openapiPlugin = fp<OpenapiPluginOptions>(
  async (app, { config }) => {
    if (!config.server.docsEnabled) return

    await app.register(swagger, {
      openapi: {
        openapi: '3.1.0',
        info: {
          title: `${config.app.name} API`,
          version: 'v1',
          description:
            'JSON over REST under /api/v1. Every response uses the data, page or error envelope.',
        },
        servers: [{ url: config.api.publicUrl }],
      },
      transform: jsonSchemaTransform,
      transformObject: jsonSchemaTransformObject,
    })

    await app.register(scalar, {
      routePrefix: API_DOCS_PATH,
      logLevel: 'silent',
      configuration: { title: `${config.app.name} API` },
    })
  },
  { name: 'openapi' },
)
