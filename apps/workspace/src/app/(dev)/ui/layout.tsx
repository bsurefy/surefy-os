// SPDX-License-Identifier: AGPL-3.0-only
import { notFound } from 'next/navigation'

import ShowcaseFrame from './ShowcaseFrame'

import type { ReactNode } from 'react'

import './ui.css'

/** Development-only pages that show every @surefy/ui component; not available in production. */
export default function ShowcaseLayout({ children }: Readonly<{ children: ReactNode }>) {
  if (process.env.NODE_ENV === 'production') notFound()
  return <ShowcaseFrame>{children}</ShowcaseFrame>
}
