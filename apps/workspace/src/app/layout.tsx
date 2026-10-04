// SPDX-License-Identifier: AGPL-3.0-only
import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import '@/styles/globals.css'

export const metadata: Metadata = {
  title: 'SurefyOS',
  description: 'The AI workspace for your organization',
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
