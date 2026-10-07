// SPDX-License-Identifier: AGPL-3.0-only
import Fastify, {
  type FastifyInstance,
  type RawReplyDefaultExpression,
  type RawRequestDefaultExpression,
  type RawServerDefault,
} from 'fastify'
import fp from 'fastify-plugin'
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'
import { z } from 'zod'

import { ServiceUnavailableError } from '@/core/errors/index.js'
import { okResponse } from '@surefy/contracts'

import { errorHandlerPlugin } from './errorHandler.plugin.js'
import { replyPlugin } from './reply.plugin.js'

import type { Logger } from '@/core/logger/index.js'

export type HealthCheck = () => Promise<void>

export interface HealthPluginOptions {
  /** Named dependency checks for `/health/ready` (database, redis, workers…). */
  checks: Record<string, HealthCheck>
  /** The loaded extensions, reported by `/health/ready`. */
  extensions: () => readonly string[]
}

const liveSchema = okResponse(z.object({ status: z.literal('ok') }))
const readySchema = okResponse(
  z.object({
    status: z.literal('ok'),
    checks: z.record(z.string(), z.literal('ok')),
    extensions: z.array(z.string()),
  }),
)

// Public, excluded from rate limiting and request logging: orchestrators poll these constantly.
const probeConfig = { public: true, rateLimit: false as const }

/**
 * `GET /health/live`: the process runs. `GET /health/ready`: every dependency check passes; a
 * failing check answers `503 SERVICE_UNAVAILABLE` with the failed checks in `details`.
 */
export const healthPlugin = fp<HealthPluginOptions>(
  (instance, options) => {
    const app = instance.withTypeProvider<ZodTypeProvider>()

    app.get(
      '/health/live',
      {
        logLevel: 'silent',
        config: probeConfig,
        schema: {
          tags: ['health'],
          summary: 'Liveness probe',
          response: { 200: liveSchema },
        },
      },
      (_request, reply) => {
        reply.ok({ status: 'ok' as const })
      },
    )

    app.get(
      '/health/ready',
      {
        logLevel: 'silent',
        config: probeConfig,
        schema: {
          tags: ['health'],
          summary: 'Readiness probe',
          description:
            'Checks the database, Redis and the worker processes; lists the loaded extensions.',
          response: { 200: readySchema },
        },
      },
      async (_request, reply) => {
        const results = await Promise.all(
          Object.entries(options.checks).map(async ([name, check]) => {
            try {
              await check()
              return { name, error: undefined }
            } catch (error) {
              return { name, error }
            }
          }),
        )
        const failed = results.filter((result) => result.error !== undefined)
        if (failed.length > 0) {
          throw new ServiceUnavailableError(undefined, 'Dependencies unavailable', {
            details: failed.map(({ name }) => ({ check: name, status: 'failed' })),
            meta: { failed: failed.map(({ name }) => name) },
            cause: failed[0]?.error,
          })
        }
        reply.ok({
          status: 'ok' as const,
          checks: Object.fromEntries(results.map(({ name }) => [name, 'ok' as const])),
          extensions: [...options.extensions()],
        })
      },
    )
  },
  { name: 'health' },
)

export interface WorkerHealthServerOptions extends HealthPluginOptions {
  logger: Logger
  host: string
  /** `WORKER_HEALTH_PORT`, internal only. */
  port: number
}

/**
 * The worker's own `/health/live` and `/health/ready`, so orchestrators can check it too. Its
 * readiness also requires the BullMQ workers to be running (a `workers` check).
 */
export async function startWorkerHealthServer(
  options: WorkerHealthServerOptions,
): Promise<FastifyInstance> {
  const health = Fastify<RawServerDefault, RawRequestDefaultExpression, RawReplyDefaultExpression>({
    loggerInstance: options.logger,
    disableRequestLogging: true,
  })
  health.setValidatorCompiler(validatorCompiler)
  health.setSerializerCompiler(serializerCompiler)
  await health.register(errorHandlerPlugin)
  await health.register(replyPlugin)
  await health.register(healthPlugin, { checks: options.checks, extensions: options.extensions })
  await health.listen({ host: options.host, port: options.port })
  return health
}
