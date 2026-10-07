// SPDX-License-Identifier: AGPL-3.0-only
import type { SessionApp } from '@surefy/contracts'

import type { Config } from '@/core/config/index.js'

/**
 * The hosts Better Auth may build links and callbacks for: each web app (every app proxies
 * `/api/auth/*` on its own host, ADR 0006) and the public API host as the fallback.
 */
export function authAllowedHosts(config: Config): string[] {
  return [...new Set([...config.web.origins, config.api.publicUrl].map((url) => new URL(url).host))]
}

/**
 * The origin of a request: the web app whose host the request carries (`request.host` honours
 * `X-Forwarded-Host` only from a trusted hop), otherwise the public API URL. Never a host the
 * client chose freely, so email links and redirects always point at a configured app.
 */
export function trustedOriginOf(config: Config, host: string | undefined): string {
  const match = config.web.origins.find((origin) => new URL(origin).host === host)
  return match ?? new URL(config.api.publicUrl).origin
}

/** The app a session is created for, from the origin of its request; custom domains are workspace. */
export function appOfUrl(config: Config, url: string | undefined): SessionApp {
  if (url === undefined) return 'workspace'
  let origin: string
  try {
    origin = new URL(url).origin
  } catch {
    return 'workspace'
  }
  const { apps } = config.web
  if (apps.console !== undefined && new URL(apps.console).origin === origin) return 'console'
  if (apps.partner !== undefined && new URL(apps.partner).origin === origin) return 'partner'
  return 'workspace'
}
