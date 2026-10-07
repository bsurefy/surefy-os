// SPDX-License-Identifier: AGPL-3.0-only
import { SCENARIO_COOKIE, SCENARIOS } from '@surefy/web-core/testing/mock'

/** The mock server's own pages: a scenario switcher, until the app's dev toolbar exists. */
export const CONTROL_PATH = '/__mock'

const escape = (value: string) => value.replaceAll(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`)

/**
 * The scenario cookie is set on the API host. Cookies are not port-specific, so the app on
 * `localhost:3000` sends it too, and the app forwards it to the API.
 */
export function scenarioCookie(scenario: string | undefined): string {
  if (scenario === undefined || scenario === 'default') {
    return `${SCENARIO_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`
  }
  return `${SCENARIO_COOKIE}=${encodeURIComponent(scenario)}; Path=/; SameSite=Lax`
}

export function controlPage(options: {
  current: string | undefined
  mocked: readonly string[]
  passthrough: readonly string[]
  upstreamUrl: string
}): string {
  const list = (names: readonly string[]) =>
    names.length === 0 ? 'none' : names.map((name) => `<code>${escape(name)}</code>`).join(', ')
  const links = SCENARIOS.map((scenario) => {
    const active = (options.current ?? 'default') === scenario
    const label = active ? `<strong>${scenario}</strong>` : scenario
    return `<li><a href="${CONTROL_PATH}/scenario?set=${scenario}">${label}</a></li>`
  }).join('')
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Mock server</title>
<style>body{font:14px system-ui;margin:2rem;max-width:40rem}li{margin:.25rem 0}</style></head>
<body><h1>Mock server</h1>
<p>Mocked domains: ${list(options.mocked)}</p>
<p>Forwarded to <code>${escape(options.upstreamUrl)}</code>: ${list(options.passthrough)}, and every unmocked route.</p>
<h2>Scenario</h2><ul>${links}</ul>
<p>A <code>?scenario=</code> query value or an <code>x-mock-scenario</code> header overrides the cookie for one request.</p>
</body></html>`
}
