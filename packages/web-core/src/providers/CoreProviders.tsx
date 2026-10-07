// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { NextIntlClientProvider } from 'next-intl'
import { ThemeProvider } from 'next-themes'
import { NuqsAdapter } from 'nuqs/adapters/next/app'

import { CoreQueryProvider } from './CoreQueryProvider'
import { DEFAULT_THEME, THEME_STORAGE_KEY } from './providers.constants'
import { ThemedToaster } from './ThemedToaster'
import { UiLabelsBridge } from './UiLabelsBridge'
import { ZodErrorMapProvider } from '../i18n/ZodErrorMapProvider'

import type { CoreProvidersProps } from './CoreProviders.types'

/**
 * The providers every app mounts once, in its root layout, around everything else: intl (with the
 * `@surefy/ui` labels and the Zod error map), the query client with the global error handlers,
 * the theme, the nuqs adapter and the toaster. The app wraps it in its own providers component to
 * supply the handlers (functions cannot cross the server boundary).
 */
export function CoreProviders({
  locale,
  messages,
  timeZone,
  handlers,
  defaultTheme = DEFAULT_THEME,
  children,
}: Readonly<CoreProvidersProps>) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone={timeZone}>
      <UiLabelsBridge>
        <ZodErrorMapProvider>
          <CoreQueryProvider handlers={handlers}>
            <ThemeProvider
              attribute="class"
              defaultTheme={defaultTheme}
              storageKey={THEME_STORAGE_KEY}
              enableSystem
              disableTransitionOnChange
            >
              <NuqsAdapter>
                {children}
                <ThemedToaster />
              </NuqsAdapter>
            </ThemeProvider>
          </CoreQueryProvider>
        </ZodErrorMapProvider>
      </UiLabelsBridge>
    </NextIntlClientProvider>
  )
}
