// SPDX-License-Identifier: AGPL-3.0-only
import { http, HttpResponse } from 'msw'

import { builtinScenarioResponse } from './builtinScenarios'
import { SCENARIO_RESPONSE_HEADER } from './mock.constants'
import { resolveScenario, isScenario } from './resolveScenario'
import { mockPath } from './responses'
import { validateMockResponse } from './validateMockResponse'

import type { MockHandlerConfig, MockResolver, MockResolverInfo } from './mock.types'
import type { HttpHandler, JsonBodyType } from 'msw'

async function runResolver<Body extends JsonBodyType>(
  resolver: MockResolver<Body>,
  info: MockResolverInfo,
): Promise<Response> {
  const result = await resolver(info)
  return result instanceof Response ? result : HttpResponse.json(result)
}

function tagScenario(response: Response, scenario: string): void {
  // a network error's headers are immutable; nothing to tag there anyway
  if (response.type === 'error') return
  response.headers.set(SCENARIO_RESPONSE_HEADER, scenario)
}

/**
 * One mocked route. The request's scenario picks the answer: the handler's own scenario when it
 * defines one, else a built-in one (`slow`, `empty`, `error`, `forbidden`, `gated`, `limit`,
 * `offline`), else `default`. Every JSON answer is validated against the contract before it is
 * sent, so a handler that drifts from its schema fails at once.
 */
export function defineMockHandler<Body extends JsonBodyType>(
  config: MockHandlerConfig<Body>,
): HttpHandler {
  const { method, path, prefix, response: schema, scenarios } = config

  return http[method](mockPath(path, prefix), async ({ request, params, cookies }) => {
    const scenario = resolveScenario(request)
    const info: MockResolverInfo = { request, params, cookies, scenario }
    const resolveDefault = () => runResolver(scenarios.default, info)

    const own = scenarios[scenario]
    let response: Response
    if (own) response = await runResolver(own, info)
    else if (isScenario(scenario))
      response = await builtinScenarioResponse(scenario, schema, resolveDefault)
    else response = await resolveDefault()

    await validateMockResponse(response, schema, { method, path, scenario })
    tagScenario(response, scenario)
    return response
  })
}
