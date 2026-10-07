// SPDX-License-Identifier: AGPL-3.0-only
import { QueryClientProvider } from '@tanstack/react-query'
import { NextIntlClientProvider } from 'next-intl'
import { NuqsTestingAdapter } from 'nuqs/adapters/testing'

import { Toaster } from '@surefy/ui/components/Feedback'
import { TooltipProvider } from '@surefy/ui/primitives/tooltip'

import { testMessages } from './testMessages'
import { DEFAULT_LOCALE } from '../../i18n/i18n.constants'
import { ZodErrorMapProvider } from '../../i18n/ZodErrorMapProvider'
import { UiLabelsBridge } from '../../providers/UiLabelsBridge'

import type { QueryClient } from '@tanstack/react-query'
import type { AbstractIntlMessages } from 'next-intl'
import type { ComponentProps, ReactNode } from 'react'

type NuqsTestingProps = ComponentProps<typeof NuqsTestingAdapter>

/** Tests pin the time zone, so dates render the same on every machine. */
export const TEST_TIME_ZONE = 'UTC'

export interface TestProvidersProps {
  /** Shared English namespaces plus the app's own; the shared ones alone by default. */
  messages?: AbstractIntlMessages
  timeZone?: string
  queryClient: QueryClient
  /** The URL query the component starts with: `'?q=agents'` or `{ q: 'agents' }`. */
  searchParams?: NuqsTestingProps['searchParams']
  /** Called with every URL update a component makes, for assertions. */
  onUrlUpdate?: NuqsTestingProps['onUrlUpdate']
  children: ReactNode
}

/**
 * The core providers as tests need them: intl with the English messages (and the `@surefy/ui`
 * labels and the Zod error map), the given query client, the nuqs testing adapter, the tooltip
 * provider and the toaster. No theme provider: the toaster is rendered light.
 */
export function TestProviders({
  messages = testMessages,
  timeZone = TEST_TIME_ZONE,
  queryClient,
  searchParams,
  onUrlUpdate,
  children,
}: Readonly<TestProvidersProps>) {
  return (
    <NextIntlClientProvider locale={DEFAULT_LOCALE} messages={messages} timeZone={timeZone}>
      <UiLabelsBridge>
        <ZodErrorMapProvider>
          <QueryClientProvider client={queryClient}>
            <NuqsTestingAdapter searchParams={searchParams} onUrlUpdate={onUrlUpdate}>
              <TooltipProvider>{children}</TooltipProvider>
              <Toaster theme="light" />
            </NuqsTestingAdapter>
          </QueryClientProvider>
        </ZodErrorMapProvider>
      </UiLabelsBridge>
    </NextIntlClientProvider>
  )
}
