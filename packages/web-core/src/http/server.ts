// SPDX-License-Identifier: AGPL-3.0-only
import 'server-only'
import { cookies, headers } from 'next/headers'

import { createHttpClient } from './createHttpClient'
import { serverEnv } from '../env/server'

import type { HttpClient } from './http.types'

/**
 * Server-only instance: talks to the API at `INTERNAL_API_URL` and forwards the incoming
 * request's cookies and host, so the API sees the same session and app as the browser would.
 */
export async function getServerHttpClient(): Promise<HttpClient> {
  const cookieHeader = (await cookies()).toString()
  const host = (await headers()).get('host') ?? ''
  return createHttpClient({
    getBaseUrl: () => serverEnv.INTERNAL_API_URL,
    getHeaders: () => ({ cookie: cookieHeader, 'x-forwarded-host': host }),
  })
}
