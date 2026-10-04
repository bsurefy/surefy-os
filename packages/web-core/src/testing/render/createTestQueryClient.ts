// SPDX-License-Identifier: AGPL-3.0-only
import { createTranslator } from 'next-intl'

import { toast } from '@surefy/ui/components/Feedback'

import { testMessages } from './testMessages'
import { getErrorMessage } from '../../errors/getErrorMessage'
import { DEFAULT_LOCALE } from '../../i18n/i18n.constants'
import { createQueryClient } from '../../query/createQueryClient'

import type { ErrorsTranslator } from '../../errors/errors.types'
import type { QueryClientHandlers } from '../../query/query.types'
import type { QueryClient } from '@tanstack/react-query'
import type { AbstractIntlMessages } from 'next-intl'

export interface TestQueryClientOptions {
  /** Spies for the global handlers; the error toast is shown unless `showError` is replaced. */
  handlers?: Partial<QueryClientHandlers>
  /** The messages the error toast translates with (the shared English ones by default). */
  messages?: AbstractIntlMessages
}

/**
 * The app's query client behavior (global error handlers, the translated error toast) with
 * retries off, so a failing request fails the test at once. One per test: never shared.
 */
export function createTestQueryClient(options: TestQueryClientOptions = {}): QueryClient {
  const { handlers = {}, messages = testMessages } = options
  const tErrors: ErrorsTranslator = createTranslator({
    locale: DEFAULT_LOCALE,
    messages,
    namespace: 'errors',
  })

  const client = createQueryClient({
    onUnauthenticated: () => {
      // no session dialog in tests; pass a spy to assert on it
    },
    onFeatureUnavailable: () => {
      // no effective-access cache in tests; pass a spy to assert on it
    },
    showError: (error) => {
      toast.error(getErrorMessage(error, tErrors))
    },
    ...handlers,
  })
  client.setDefaultOptions({
    queries: { ...client.getDefaultOptions().queries, retry: false },
    mutations: { retry: false },
  })
  return client
}
