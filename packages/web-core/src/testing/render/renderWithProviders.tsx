// SPDX-License-Identifier: AGPL-3.0-only
import { render, renderHook } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { createTestQueryClient } from './createTestQueryClient'
import { testMessages } from './testMessages'
import { TestProviders } from './TestProviders'
import { mergeMessages } from '../../i18n/loadSharedMessages'

import type { TestProvidersProps } from './TestProviders'
import type { QueryClientHandlers } from '../../query/query.types'
import type { QueryClient } from '@tanstack/react-query'
import type {
  RenderHookOptions,
  RenderHookResult,
  RenderOptions,
  RenderResult,
} from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'
import type { AbstractIntlMessages } from 'next-intl'
import type { ReactElement, ReactNode } from 'react'

export interface ProviderOptions extends Pick<TestProvidersProps, 'searchParams' | 'onUrlUpdate'> {
  /** The app's own namespaces, merged into the shared English ones. */
  messages?: AbstractIntlMessages
  timeZone?: string
  /** A prepared client, for example to seed the cache; a fresh one with retries off otherwise. */
  queryClient?: QueryClient
  /** Spies for the global error handlers (`onUnauthenticated`, `onFeatureUnavailable`, `showError`). */
  handlers?: Partial<QueryClientHandlers>
}

export type RenderWithProvidersOptions = ProviderOptions & Omit<RenderOptions, 'wrapper'>
export type RenderWithProvidersResult = RenderResult & {
  queryClient: QueryClient
  /** A user-event session started before rendering. */
  user: UserEvent
}

export type RenderHookWithProvidersOptions<Props> = ProviderOptions &
  Omit<RenderHookOptions<Props>, 'wrapper'>
export type RenderHookWithProvidersResult<Result, Props> = RenderHookResult<Result, Props> & {
  queryClient: QueryClient
}

interface PreparedProviders {
  queryClient: QueryClient
  wrapper: ({ children }: { children: ReactNode }) => ReactElement
}

function prepareProviders(options: ProviderOptions): PreparedProviders {
  const messages = options.messages ? mergeMessages(testMessages, options.messages) : testMessages
  const queryClient =
    options.queryClient ?? createTestQueryClient({ handlers: options.handlers, messages })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <TestProviders
      messages={messages}
      timeZone={options.timeZone}
      queryClient={queryClient}
      searchParams={options.searchParams}
      onUrlUpdate={options.onUrlUpdate}
    >
      {children}
    </TestProviders>
  )
  return { queryClient, wrapper }
}

/**
 * Renders a component inside the test providers (testing.md §4): intl with the English
 * messages, its own query client with retries off, the nuqs testing adapter and the toaster.
 * Mock the network with MSW before calling it.
 */
export function renderWithProviders(
  ui: ReactElement,
  options: RenderWithProvidersOptions = {},
): RenderWithProvidersResult {
  const { messages, timeZone, queryClient, handlers, searchParams, onUrlUpdate, ...renderOptions } =
    options
  const prepared = prepareProviders({
    messages,
    timeZone,
    queryClient,
    handlers,
    searchParams,
    onUrlUpdate,
  })
  const user = userEvent.setup()
  const result = render(ui, { ...renderOptions, wrapper: prepared.wrapper })
  return { ...result, queryClient: prepared.queryClient, user }
}

/** `renderHook` inside the same providers, for controllers and query hooks. */
export function renderHookWithProviders<Result, Props = undefined>(
  callback: (props: Props) => Result,
  options: RenderHookWithProvidersOptions<Props> = {},
): RenderHookWithProvidersResult<Result, Props> {
  const { messages, timeZone, queryClient, handlers, searchParams, onUrlUpdate, ...hookOptions } =
    options
  const prepared = prepareProviders({
    messages,
    timeZone,
    queryClient,
    handlers,
    searchParams,
    onUrlUpdate,
  })
  const result = renderHook(callback, { ...hookOptions, wrapper: prepared.wrapper })
  return { ...result, queryClient: prepared.queryClient }
}
