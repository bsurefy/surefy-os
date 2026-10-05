// SPDX-License-Identifier: AGPL-3.0-only
import { getTranslations } from 'next-intl/server'

import { authApi } from '@/api/auth'
import { getServerHttpClient } from '@surefy/web-core/http/server'

import type { ReactNode } from 'react'

/** The version for the footer; the footer simply omits it when the API cannot be reached. */
async function getVersion(): Promise<string | null> {
  try {
    return (await authApi.options(await getServerHttpClient())).version
  } catch {
    return null
  }
}

/**
 * Every sign-in screen: a centered 400px card on the background with the product name above it
 * and the version below (design/workspace/auth-and-setup.md §1).
 */
export default async function AuthLayout({ children }: Readonly<{ children: ReactNode }>) {
  const [t, version] = await Promise.all([getTranslations('auth.layout'), getVersion()])

  return (
    <div className="bg-background flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-10">
      <p className="text-section-title font-semibold">{t('brand')}</p>
      <main className="border-border bg-surface w-full max-w-[400px] rounded-xl border p-6 shadow-sm">
        {children}
      </main>
      <footer className="text-caption text-muted-foreground flex flex-col items-center gap-1 text-center">
        {version !== null && <p>{t('version', { version })}</p>}
      </footer>
    </div>
  )
}
