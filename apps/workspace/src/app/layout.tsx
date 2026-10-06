// SPDX-License-Identifier: AGPL-3.0-only
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google'
import { getLocale, getMessages, getTranslations } from 'next-intl/server'

import { AppProviders } from '@/core/providers/AppProviders'
import { cn } from '@surefy/ui/lib/utils'

import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import '@/styles/globals.css'

// next/font downloads the files at build time and serves them from the app: no runtime font CDN.
const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-sans',
})
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
})

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('common')
  const productName = t('productName')
  return { title: { default: productName, template: `%s · ${productName}` } }
}

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()])

  return (
    // next-themes sets the theme class on <html> before hydration
    <html
      lang={locale}
      suppressHydrationWarning
      className={cn(plexSans.variable, plexMono.variable)}
    >
      <body className="bg-background text-foreground font-sans">
        <AppProviders locale={locale} messages={messages}>
          {children}
        </AppProviders>
      </body>
    </html>
  )
}
