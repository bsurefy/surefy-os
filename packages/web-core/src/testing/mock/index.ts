// SPDX-License-Identifier: AGPL-3.0-only
// Node-safe entry (`@surefy/web-core/testing/mock`): the mock handler primitives without React,
// for the dev mock server of each app. Tests import everything from `@surefy/web-core/testing`.
export { defineMockHandler } from './defineMockHandler'
export {
  DEFAULT_SCENARIO,
  DEFAULT_SLOW_DELAY_MS,
  MOCK_REQUEST_ID_PREFIX,
  SCENARIO_COOKIE,
  SCENARIO_HEADER,
  SCENARIO_QUERY_PARAM,
  SCENARIO_RESPONSE_HEADER,
  SCENARIOS,
} from './mock.constants'
export type { Scenario } from './mock.constants'
export type {
  MockDomain,
  MockDomainOptions,
  MockHandlerConfig,
  MockHttpMethod,
  MockResolver,
  MockResolverInfo,
  MockResolverResult,
  MockScenarios,
} from './mock.types'
export { isMockContractError, MockContractError } from './MockContractError'
export type { MockContractErrorInfo } from './MockContractError'
export { configureMockScenarios, getMockSettings, resetMockSettings } from './mockSettings'
export type { MockSettings } from './mockSettings'
export { defineMockDomain, parseMockDomains, selectMockDomains } from './registry'
export type { MockDomainSelection } from './registry'
export { isScenario, parseCookieHeader, resolveScenario } from './resolveScenario'
export {
  errorBody,
  mockError,
  mockOffline,
  mockOk,
  mockPage,
  mockPath,
  mockRequestId,
  okBody,
  pageBody,
} from './responses'
export type { ErrorBodyOptions } from './responses'
export { validateMockResponse } from './validateMockResponse'
