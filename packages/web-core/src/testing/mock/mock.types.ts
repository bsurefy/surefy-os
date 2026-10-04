// SPDX-License-Identifier: AGPL-3.0-only
import type { HttpHandler, JsonBodyType, PathParams } from 'msw'
import type { z } from 'zod'

export type MockHttpMethod = 'get' | 'post' | 'patch' | 'put' | 'delete'

export interface MockResolverInfo {
  request: Request
  /** Path parameters (`:orgId`), as MSW parsed them. */
  params: PathParams
  /** The request cookies, as MSW parsed them. */
  cookies: Record<string, string>
  /** The scenario this response is for. */
  scenario: string
}

/**
 * What a scenario answers: the success body (sent as JSON with status 200 and validated against
 * the route's contract) or a complete `Response` (`mockOk(data, { status: 201 })`, `mockError(…)`,
 * `mockOffline()`), whose JSON is validated too: success bodies against the contract, error
 * bodies against the error envelope.
 */
export type MockResolverResult<Body> = Body | Response
export type MockResolver<Body> = (
  info: MockResolverInfo,
) => MockResolverResult<Body> | Promise<MockResolverResult<Body>>

/** `default` is required; the shared scenarios have built-in answers that a handler may override. */
export type MockScenarios<Body> = { default: MockResolver<Body> } & Partial<
  Record<string, MockResolver<Body>>
>

export interface MockHandlerConfig<Body extends JsonBodyType> {
  method: MockHttpMethod
  /** The route under the API prefix, with MSW parameters: `/orgs/:orgId/agents`. */
  path: string
  /** Where the route is mounted; `''` for the root routes (`/health/live`). */
  prefix?: string
  /** The contract schema of the success body, envelope included: `okResponse(agent)`, `pageResponse(agent)`. */
  response: z.ZodType<Body>
  scenarios: MockScenarios<Body>
}

/** The handlers of one API domain: `mock/handlers/<domain>.ts` exports one of these. */
export interface MockDomain {
  readonly name: string
  readonly handlers: readonly HttpHandler[]
}
