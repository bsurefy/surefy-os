// SPDX-License-Identifier: AGPL-3.0-only
import { pino } from 'pino'
import { vi } from 'vitest'
import { z } from 'zod'

import { buildApp } from '@/app.js'
import { validEnv } from '@/core/config/__tests__/env.fixture.js'
import { parseConfig } from '@/core/config/index.js'
import { NotFoundError } from '@/core/errors/index.js'
import { NO_TENANT_ACCESS } from '@/plugins/access.plugin.js'
import { ERROR_CODES, okResponse, pageResponse } from '@surefy/contracts'

import type { Container } from '@/container.js'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

/** Routes that exercise validation, the reply helpers and the error handler end to end. */
export const probeRoutes: FastifyPluginAsyncZod = (app) => {
  const probe = z.object({ id: z.uuid(), limit: z.number() })
  app.get(
    '/probes/:id',
    {
      config: { public: true },
      schema: {
        tags: ['probes'],
        summary: 'Read a probe',
        params: z.object({ id: z.uuid() }),
        querystring: z.object({ limit: z.coerce.number().int().min(1).max(100).default(25) }),
        response: { 200: okResponse(probe) },
      },
    },
    (request, reply) => {
      reply.ok({ id: request.params.id, limit: request.query.limit })
    },
  )
  app.post(
    '/probes',
    {
      config: { public: true },
      schema: {
        tags: ['probes'],
        summary: 'Create a probe',
        body: z.object({ name: z.string().min(1), tags: z.array(z.uuid()).default([]) }),
        response: { 201: okResponse(z.object({ name: z.string() })) },
      },
    },
    (request, reply) => {
      reply.created({ name: request.body.name })
    },
  )
  app.get(
    '/probes',
    {
      config: { public: true },
      schema: {
        tags: ['probes'],
        summary: 'List probes',
        response: { 200: pageResponse(z.object({ name: z.string() })) },
      },
    },
    (_request, reply) => {
      reply.page([{ name: 'a' }, { name: 'b' }], 'next-cursor')
    },
  )
  app.delete(
    '/probes/:id',
    {
      config: { public: true },
      schema: { tags: ['probes'], summary: 'Delete a probe', params: z.object({ id: z.uuid() }) },
    },
    (_request, reply) => {
      reply.noContent()
    },
  )
  app.get('/errors/domain', { config: { public: true } }, () => {
    throw new NotFoundError(ERROR_CODES.NOT_FOUND, 'Probe not found', { meta: { probeId: 'p1' } })
  })
  app.get('/errors/crash', { config: { public: true } }, () => {
    throw new Error('database password is hunter2')
  })
  app.get(
    '/errors/serialization',
    {
      config: { public: true },
      schema: { response: { 200: okResponse(z.object({ name: z.string() })) } },
    },
    (_request, reply) => {
      reply.ok({ name: 42 as unknown as string })
    },
  )
  app.get(
    '/limited',
    { config: { public: true, rateLimit: { max: 1, timeWindow: 60_000 } } },
    (_request, reply) => {
      reply.ok({ fine: true })
    },
  )
  return Promise.resolve()
}

const noRoutes: FastifyPluginAsyncZod = () => Promise.resolve()

export interface TestAppOptions {
  env?: Record<string, string>
  dbPing?: () => Promise<void>
  cachePing?: () => Promise<void>
  extensions?: string[]
}

/** `buildApp` over a container of fakes: no Postgres, no Redis, an in-memory rate-limit store. */
export async function createTestApp(options: TestAppOptions = {}) {
  const config = parseConfig('api', { ...validEnv, ...options.env })
  const container = {
    config,
    logger: pino({ level: 'silent' }),
    db: { ping: options.dbPing ?? vi.fn(() => Promise.resolve()) },
    cache: { ping: options.cachePing ?? vi.fn(() => Promise.resolve()), client: undefined },
    extensions: { names: options.extensions ?? [], routes: [probeRoutes], jobs: [] },
    // No Better Auth and no module routes: nobody is signed in, and only the probes exist.
    auth: {
      handler: () => Promise.resolve(Response.json({ ok: true })),
      api: { getSession: vi.fn(() => Promise.resolve({ headers: new Headers(), response: null })) },
    },
    tenants: NO_TENANT_ACCESS,
    modules: {
      auth: { routes: noRoutes },
      setup: { routes: noRoutes },
      install: { routes: noRoutes },
      notifications: { routes: noRoutes },
      organizations: { routes: noRoutes },
      teams: { routes: noRoutes },
      members: { routes: noRoutes },
      access: { routes: noRoutes },
      vault: { routes: noRoutes },
      chats: { routes: noRoutes },
      usage: { routes: noRoutes },
      audit: { routes: noRoutes },
      dataControl: { routes: noRoutes },
      files: { routes: noRoutes },
    },
  } as unknown as Container
  const app = await buildApp(container)
  await app.ready()
  return app
}
