// SPDX-License-Identifier: AGPL-3.0-only
import { PUBLIC_PATHS, ROUTES } from '@/constants/routes'
import { createSessionProxy } from '@surefy/web-core/auth/proxy'

/** Optimistic gate: no session cookie, no page outside `PUBLIC_PATHS`. Permissions are decided later. */
export const proxy = createSessionProxy({ loginPath: ROUTES.auth.login, publicPaths: PUBLIC_PATHS })

// Must be a static literal: Next.js reads it at build time
export const config = { matcher: ['/((?!api|_next/static|_next/image|favicon.ico|brand).*)'] }
