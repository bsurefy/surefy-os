// SPDX-License-Identifier: AGPL-3.0-only
// Test-only entry (`@surefy/web-core/testing`): the render helpers, the MSW test server, the
// fixture factories and the mock handler primitives. Never imported by app code.
export { createIdSequence, defineFactory } from './fixtures/defineFactory'
export type { Factory } from './fixtures/defineFactory'
export * from './mock'
export { createTestServer, setupTestServer } from './msw/createTestServer'
export type { TestServer } from './msw/createTestServer'
export { createTestQueryClient } from './render/createTestQueryClient'
export type { TestQueryClientOptions } from './render/createTestQueryClient'
export { renderHookWithProviders, renderWithProviders } from './render/renderWithProviders'
export type {
  ProviderOptions,
  RenderHookWithProvidersOptions,
  RenderHookWithProvidersResult,
  RenderWithProvidersOptions,
  RenderWithProvidersResult,
} from './render/renderWithProviders'
export { testMessages } from './render/testMessages'
export { TEST_TIME_ZONE, TestProviders } from './render/TestProviders'
export type { TestProvidersProps } from './render/TestProviders'
