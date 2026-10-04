// SPDX-License-Identifier: AGPL-3.0-only
import { getSessionCookie } from 'better-auth/cookies'
import { NextResponse, type NextRequest } from 'next/server'

import { REDIRECT_PARAM } from './redirects'

export interface SessionProxyOptions {
  /** The app's sign-in page (`ROUTES.auth.login`). */
  loginPath: string
  /** Paths reachable without a session; each also covers everything below it. */
  publicPaths: readonly string[]
}

function isPublicPath(pathname: string, publicPaths: readonly string[]): boolean {
  return publicPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`))
}

/**
 * The `proxy` of each app's `src/proxy.ts`: a cheap, optimistic check that this app's session
 * cookie exists. Without it, the person goes to the login page with the requested path in
 * `?redirect=`. It never decides permissions; server layouts and the API do.
 */
export function createSessionProxy({ loginPath, publicPaths }: SessionProxyOptions) {
  return function proxy(request: NextRequest): NextResponse {
    const { pathname, search } = request.nextUrl
    if (isPublicPath(pathname, publicPaths) || getSessionCookie(request)) return NextResponse.next()

    const url = new URL(loginPath, request.url)
    url.searchParams.set(REDIRECT_PARAM, `${pathname}${search}`)
    return NextResponse.redirect(url)
  }
}
