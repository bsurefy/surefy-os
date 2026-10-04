// SPDX-License-Identifier: AGPL-3.0-only
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ULID_PATTERN } from '@/lib/ulid.js'
import { errorResponse } from '@surefy/contracts'

import { createTestApp } from './testApp.js'

import type { FastifyInstance } from 'fastify'

const PROBE_ID = '0199c0de-0000-7000-8000-000000000001'

describe('buildApp', () => {
  let app: FastifyInstance
  beforeAll(async () => {
    app = await createTestApp({ env: { PUBLIC_CORS_ORIGINS: 'https://widget.example' } })
  })
  afterAll(() => app.close())

  describe('health', () => {
    it('answers /health/live with the data envelope', async () => {
      const response = await app.inject({ method: 'GET', url: '/health/live' })
      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ data: { status: 'ok' } })
    })

    it('answers /health/ready with the checks and the loaded extensions', async () => {
      const response = await app.inject({ method: 'GET', url: '/health/ready' })
      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({
        data: { status: 'ok', checks: { database: 'ok', redis: 'ok' }, extensions: [] },
      })
    })
  })

  describe('request context', () => {
    it('returns a ULID request id and echoes a well-formed incoming one', async () => {
      const generated = await app.inject({ method: 'GET', url: '/health/live' })
      expect(generated.headers['x-request-id']).toMatch(ULID_PATTERN)
      const forwarded = await app.inject({
        method: 'GET',
        url: '/health/live',
        headers: { 'x-request-id': 'proxy-request-0001' },
      })
      expect(forwarded.headers['x-request-id']).toBe('proxy-request-0001')
      const rejected = await app.inject({
        method: 'GET',
        url: '/health/live',
        headers: { 'x-request-id': 'not valid!' },
      })
      expect(rejected.headers['x-request-id']).toMatch(ULID_PATTERN)
    })
  })

  describe('security', () => {
    it('sets security headers', async () => {
      const response = await app.inject({ method: 'GET', url: '/health/live' })
      expect(response.headers['x-content-type-options']).toBe('nosniff')
      expect(response.headers['x-frame-options']).toBeDefined()
    })

    it('answers CORS only on the public API host for allow-listed origins', async () => {
      const onApiHost = await app.inject({
        method: 'GET',
        url: '/health/live',
        headers: { host: 'localhost:4000', origin: 'https://widget.example' },
      })
      expect(onApiHost.headers['access-control-allow-origin']).toBe('https://widget.example')
      const unknownOrigin = await app.inject({
        method: 'GET',
        url: '/health/live',
        headers: { host: 'localhost:4000', origin: 'https://evil.example' },
      })
      expect(unknownOrigin.headers['access-control-allow-origin']).toBeUndefined()
      const onAppHost = await app.inject({
        method: 'GET',
        url: '/health/live',
        headers: { host: 'app.example', origin: 'https://widget.example' },
      })
      expect(onAppHost.headers['access-control-allow-origin']).toBeUndefined()
    })
  })

  describe('reply helpers and validation', () => {
    it('serializes ok, created, page and noContent through the response schema', async () => {
      const ok = await app.inject({ method: 'GET', url: `/api/v1/probes/${PROBE_ID}?limit=5` })
      expect(ok.statusCode).toBe(200)
      expect(ok.json()).toEqual({ data: { id: PROBE_ID, limit: 5 } })

      const defaulted = await app.inject({ method: 'GET', url: `/api/v1/probes/${PROBE_ID}` })
      expect(defaulted.json()).toEqual({ data: { id: PROBE_ID, limit: 25 } })

      const created = await app.inject({
        method: 'POST',
        url: '/api/v1/probes',
        payload: { name: 'p', secret: 'not in the contract' },
      })
      expect(created.statusCode).toBe(201)
      expect(created.json()).toEqual({ data: { name: 'p' } })

      const page = await app.inject({ method: 'GET', url: '/api/v1/probes' })
      expect(page.json()).toEqual({
        data: [{ name: 'a' }, { name: 'b' }],
        meta: { nextCursor: 'next-cursor' },
      })

      const deleted = await app.inject({ method: 'DELETE', url: `/api/v1/probes/${PROBE_ID}` })
      expect(deleted.statusCode).toBe(204)
      expect(deleted.body).toBe('')
    })

    it('answers 422 VALIDATION_FAILED with field-level details', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/probes',
        payload: { name: '', tags: ['a', PROBE_ID, 'b'] },
      })
      expect(response.statusCode).toBe(422)
      const body = errorResponse.parse(response.json())
      expect(body.error.code).toBe('VALIDATION_FAILED')
      expect(body.error.requestId).toBe(response.headers['x-request-id'])
      expect(body.error.details).toEqual([
        expect.objectContaining({ path: 'name', code: 'too_small' }),
        expect.objectContaining({ path: 'tags.0', code: 'invalid_format' }),
        expect.objectContaining({ path: 'tags.2', code: 'invalid_format' }),
      ])
    })

    it('validates params and query strings the same way', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/v1/probes/nope?limit=500' })
      expect(response.statusCode).toBe(422)
      const paths = errorResponse.parse(response.json()).error.details.map((detail) => detail.path)
      expect(paths).toContain('id')
    })
  })

  describe('error handler', () => {
    it('answers unknown routes with the 404 envelope', async () => {
      const response = await app.inject({ method: 'GET', url: '/nope' })
      expect(response.statusCode).toBe(404)
      expect(response.json()).toEqual({
        error: {
          code: 'NOT_FOUND',
          message: 'Route not found',
          requestId: response.headers['x-request-id'],
          details: [],
        },
      })
    })

    it('maps domain errors to their status and code', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/v1/errors/domain' })
      expect(response.statusCode).toBe(404)
      expect(response.json()).toMatchObject({
        error: { code: 'NOT_FOUND', message: 'Probe not found', details: [] },
      })
    })

    it('hides unexpected errors behind INTERNAL_ERROR', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/v1/errors/crash' })
      expect(response.statusCode).toBe(500)
      expect(response.json()).toMatchObject({
        error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' },
      })
      expect(response.body).not.toContain('hunter2')
    })

    it('treats a reply that breaks its schema as an internal error', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/v1/errors/serialization' })
      expect(response.statusCode).toBe(500)
      expect(response.json()).toMatchObject({ error: { code: 'INTERNAL_ERROR' } })
    })

    it('passes Fastify client errors through with BAD_REQUEST', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/probes',
        headers: { 'content-type': 'application/json' },
        payload: '{not json',
      })
      expect(response.statusCode).toBe(400)
      expect(response.json()).toMatchObject({ error: { code: 'BAD_REQUEST' } })
    })

    it('answers 429 RATE_LIMITED with Retry-After', async () => {
      await app.inject({ method: 'GET', url: '/api/v1/limited' })
      const response = await app.inject({ method: 'GET', url: '/api/v1/limited' })
      expect(response.statusCode).toBe(429)
      expect(response.headers['retry-after']).toBeDefined()
      expect(response.json()).toMatchObject({ error: { code: 'RATE_LIMITED' } })
    })
  })

  describe('openapi', () => {
    it('serves the OpenAPI document and the Scalar page in development', async () => {
      const document = await app.inject({ method: 'GET', url: '/api/docs/openapi.json' })
      expect(document.statusCode).toBe(200)
      const paths = Object.keys(document.json<{ paths: Record<string, unknown> }>().paths)
      expect(paths).toContain('/health/live')
      expect(paths).toContain('/api/v1/probes/{id}')
      const redirect = await app.inject({ method: 'GET', url: '/api/docs' })
      expect(redirect.statusCode).toBe(301)
      const page = await app.inject({ method: 'GET', url: '/api/docs/' })
      expect(page.statusCode).toBe(200)
      expect(page.headers['content-type']).toContain('text/html')
    })
  })
})

describe('buildApp without docs and with failing dependencies', () => {
  it('hides the docs in production unless enabled', async () => {
    const app = await createTestApp({ env: { NODE_ENV: 'production' } })
    const response = await app.inject({ method: 'GET', url: '/api/docs/openapi.json' })
    expect(response.statusCode).toBe(404)
    await app.close()
  })

  it('answers /health/ready with 503 and the failed checks', async () => {
    const app = await createTestApp({
      dbPing: () => Promise.reject(new Error('connection refused')),
      extensions: ['surefy-ee'],
    })
    const response = await app.inject({ method: 'GET', url: '/health/ready' })
    expect(response.statusCode).toBe(503)
    expect(response.json()).toMatchObject({
      error: {
        code: 'SERVICE_UNAVAILABLE',
        details: [{ check: 'database', status: 'failed' }],
      },
    })
    expect(response.body).not.toContain('connection refused')
    await app.close()
  })
})
