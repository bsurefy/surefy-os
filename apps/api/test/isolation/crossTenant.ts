// SPDX-License-Identifier: AGPL-3.0-only
import { ERROR_CODES } from '@surefy/contracts'

import { assertNoFindings } from './errors.js'
import { findLeaks, type LeakMarkers } from './leaks.js'
import { request, type HttpMethod } from '../helpers/request.js'

import type { AuthHeaders } from '../helpers/auth.js'
import type { FastifyInstance, LightMyRequestResponse } from 'fastify'

/** One org-scoped route from the route table, with `:orgId` and its resource params. */
export interface OrgScopedRoute {
  method: HttpMethod
  /** The Fastify path under /api/v1, for example `/orgs/:orgId/teams/:teamId`. */
  path: string
  /** A valid body for writes, so validation does not answer before the tenant check does. */
  payload?: unknown
}

/** Organization A has the data; B's member and API key try to reach it. */
export interface CrossTenantSubjects {
  orgA: {
    id: string
    /** A's real resource ids, keyed by path parameter (`teamId`). */
    params: Readonly<Record<string, string>>
    /** A's ids and content that must not appear in any response. */
    markers: LeakMarkers
  }
  orgB: {
    id: string
    /** A session of a member of B (`authHeaders`). */
    session: AuthHeaders
    /** An API key of B, when the route accepts keys. */
    apiKey?: AuthHeaders
  }
}

export interface CrossTenantCase {
  name: string
  method: HttpMethod
  url: string
  headers: AuthHeaders
  payload?: unknown
  expected: { statusCode: number; code?: string }
}

const PARAM_PATTERN = /:([A-Za-z_]\w*)/g

/** Replaces every `:param` in the path; a missing value is a mistake in the test, not a 404. */
export function fillPath(path: string, params: Readonly<Record<string, string>>): string {
  return path.replaceAll(PARAM_PATTERN, (_match, name: string) => {
    const value = params[name]
    if (value === undefined) throw new Error(`no value for :${name} in ${path}`)
    return encodeURIComponent(value)
  })
}

/**
 * The attempts testing.md (§4, step 2) requires for every org-scoped route:
 * B's `orgId` with A's resource ids (404), A's `orgId` with B's session (404
 * ORGANIZATION_NOT_FOUND) and A's path with B's API key (404 ORGANIZATION_NOT_FOUND).
 */
export function crossTenantCases(
  route: OrgScopedRoute,
  subjects: CrossTenantSubjects,
): CrossTenantCase[] {
  const { orgA, orgB } = subjects
  const payload = route.payload === undefined ? {} : { payload: route.payload }
  const cases: CrossTenantCase[] = [
    {
      name: `${route.method} ${route.path}: B's orgId with A's ids`,
      method: route.method,
      url: `/api/v1${fillPath(route.path, { ...orgA.params, orgId: orgB.id })}`,
      headers: orgB.session,
      ...payload,
      expected: { statusCode: 404 },
    },
    {
      name: `${route.method} ${route.path}: A's orgId with B's session`,
      method: route.method,
      url: `/api/v1${fillPath(route.path, { ...orgA.params, orgId: orgA.id })}`,
      headers: orgB.session,
      ...payload,
      expected: { statusCode: 404, code: ERROR_CODES.ORGANIZATION_NOT_FOUND },
    },
  ]
  if (orgB.apiKey !== undefined) {
    cases.push({
      name: `${route.method} ${route.path}: A's path with B's API key`,
      method: route.method,
      url: `/api/v1${fillPath(route.path, { ...orgA.params, orgId: orgA.id })}`,
      headers: orgB.apiKey,
      ...payload,
      expected: { statusCode: 404, code: ERROR_CODES.ORGANIZATION_NOT_FOUND },
    })
  }
  return cases
}

const errorCode = (response: LightMyRequestResponse): string | undefined => {
  try {
    const body = response.json<{ error?: { code?: unknown } }>()
    return typeof body.error?.code === 'string' ? body.error.code : undefined
  } catch {
    return undefined
  }
}

/** Runs one case and returns its findings: wrong status, wrong code, or A's markers in the body. */
export async function checkCrossTenantCase(
  app: FastifyInstance,
  testCase: CrossTenantCase,
  markers: LeakMarkers,
): Promise<string[]> {
  const response = await request(app, testCase.method, testCase.url, {
    headers: testCase.headers,
    ...(testCase.payload === undefined ? {} : { payload: testCase.payload }),
  })
  const findings: string[] = []
  if (response.statusCode !== testCase.expected.statusCode) {
    findings.push(
      `${testCase.name}: expected ${testCase.expected.statusCode}, got ${response.statusCode}`,
    )
  }
  const code = errorCode(response)
  if (testCase.expected.code !== undefined && code !== testCase.expected.code) {
    findings.push(
      `${testCase.name}: expected ${testCase.expected.code}, got ${code ?? 'no error code'}`,
    )
  }
  for (const marker of findLeaks(response.body, markers)) {
    findings.push(`${testCase.name}: body contains ${JSON.stringify(marker)}`)
  }
  return findings
}

/** Every attempt on one route; throws an `IsolationError` listing all findings. */
export async function assertRouteIsolation(
  app: FastifyInstance,
  route: OrgScopedRoute,
  subjects: CrossTenantSubjects,
): Promise<void> {
  const findings: string[] = []
  for (const testCase of crossTenantCases(route, subjects)) {
    findings.push(...(await checkCrossTenantCase(app, testCase, subjects.orgA.markers)))
  }
  assertNoFindings(`${route.method} ${route.path}`, findings)
}
