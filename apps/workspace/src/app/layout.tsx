// SPDX-License-Identifier: AGPL-3.0-only
import { getLocale, getMessages, getTranslations } from 'next-intl/server'

import { AppProviders } from '@/core/providers/AppProviders'

import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import '@/styles/globals.css'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('common')
  const productName = t('productName')
  return { title: { default: productName, template: `%s · ${productName}` } }
}

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()])

  return (
    // next-themes sets the theme class on <html> before hydration
    <html lang={locale} suppressHydrationWarning>
      <body>
        <AppProviders locale={locale} messages={messages}>
          {children}
        </AppProviders>
      </body>
    </html>
  )
}
