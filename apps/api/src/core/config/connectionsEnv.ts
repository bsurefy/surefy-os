// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

/**
 * The OAuth apps of the integrations people connect in Settings › Connections (Google Drive,
 * Notion, Slack), registered by the install administrator at each app. A provider offers
 * "Continue with {app}" only when both its client ID and secret are set. They are separate from
 * the `OAUTH_*` apps that sign people in to SurefyOS itself.
 *
 * `CONNECTIONS_LOCAL_HOSTS` lists the hosts that may be reached over plain http, and on private
 * addresses, by custom APIs and MCP servers (comma-separated host names, for local servers).
 *
 * `CONNECTIONS_PROVIDER_ORIGINS` moves every address SurefyOS calls for Google Drive or Notion
 * (sign-in, tokens, API, downloads) to another origin, path kept:
 * `google-drive=http://127.0.0.1:4026,notion=http://127.0.0.1:4026`. It exists for the stub
 * servers of the end-to-end run: the origin's host must be a local host, and production refuses it.
 */
export const CONNECTION_OAUTH_APP_KEYS = ['google-drive', 'notion', 'slack'] as const
export type ConnectionOauthAppKey = (typeof CONNECTION_OAUTH_APP_KEYS)[number]

/** The providers whose addresses `CONNECTIONS_PROVIDER_ORIGINS` may move. */
export const CONNECTION_ORIGIN_PROVIDER_KEYS = ['google-drive', 'notion'] as const
export type ConnectionOriginProviderKey = (typeof CONNECTION_ORIGIN_PROVIDER_KEYS)[number]
export type ConnectionProviderOrigins = Partial<Record<ConnectionOriginProviderKey, string>>

const splitList = (value: string): string[] =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)

/**
 * The `key=origin` pairs of `CONNECTIONS_PROVIDER_ORIGINS`, or the problem with the first entry
 * that is not one: an unknown provider, or an address that is not a bare http(s) origin.
 */
export function parseProviderOrigins(
  value: string,
): { origins: ConnectionProviderOrigins } | { problem: string } {
  const origins: ConnectionProviderOrigins = {}
  for (const entry of splitList(value)) {
    const at = entry.indexOf('=')
    const key = entry.slice(0, at).trim()
    const address = entry.slice(at + 1).trim()
    if (at === -1 || !(CONNECTION_ORIGIN_PROVIDER_KEYS as readonly string[]).includes(key)) {
      return { problem: `"${entry}" is not ${CONNECTION_ORIGIN_PROVIDER_KEYS.join(' or ')}=origin` }
    }
    let url: URL
    try {
      url = new URL(address)
    } catch {
      return { problem: `"${address}" is not an address` }
    }
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.origin !== address) {
      return { problem: `"${address}" is not an http(s) origin (no path or trailing slash)` }
    }
    origins[key as ConnectionOriginProviderKey] = url.origin
  }
  return { origins }
}

const ENV_PREFIX: Record<ConnectionOauthAppKey, string> = {
  'google-drive': 'GOOGLE_DRIVE',
  notion: 'NOTION',
  slack: 'SLACK',
}

export const connectionsEnvSchema = z
  .object({
    CONNECTIONS_OAUTH_GOOGLE_DRIVE_CLIENT_ID: z.string().min(1).optional(),
    CONNECTIONS_OAUTH_GOOGLE_DRIVE_CLIENT_SECRET: z.string().min(1).optional(),
    CONNECTIONS_OAUTH_NOTION_CLIENT_ID: z.string().min(1).optional(),
    CONNECTIONS_OAUTH_NOTION_CLIENT_SECRET: z.string().min(1).optional(),
    CONNECTIONS_OAUTH_SLACK_CLIENT_ID: z.string().min(1).optional(),
    CONNECTIONS_OAUTH_SLACK_CLIENT_SECRET: z.string().min(1).optional(),
    // the Slack app's signing secret: checks the events Slack delivers to the agents' Slack channels
    CONNECTIONS_SLACK_SIGNING_SECRET: z.string().min(1).optional(),
    CONNECTIONS_LOCAL_HOSTS: z.string().default(''),
    CONNECTIONS_PROVIDER_ORIGINS: z.string().default(''),
  })
  .superRefine((env, ctx) => {
    const parsed = parseProviderOrigins(env.CONNECTIONS_PROVIDER_ORIGINS)
    if ('problem' in parsed) {
      ctx.addIssue({
        code: 'custom',
        path: ['CONNECTIONS_PROVIDER_ORIGINS'],
        message: parsed.problem,
      })
    } else {
      const localHosts = splitList(env.CONNECTIONS_LOCAL_HOSTS).map((host) => host.toLowerCase())
      for (const origin of Object.values(parsed.origins)) {
        if (!localHosts.includes(new URL(origin).hostname.toLowerCase())) {
          ctx.addIssue({
            code: 'custom',
            path: ['CONNECTIONS_PROVIDER_ORIGINS'],
            message: `${origin} is not on CONNECTIONS_LOCAL_HOSTS`,
          })
        }
      }
    }
    for (const key of CONNECTION_OAUTH_APP_KEYS) {
      const prefix = `CONNECTIONS_OAUTH_${ENV_PREFIX[key]}`
      const id = env[`${prefix}_CLIENT_ID` as keyof typeof env]
      const secret = env[`${prefix}_CLIENT_SECRET` as keyof typeof env]
      if ((id === undefined) !== (secret === undefined)) {
        ctx.addIssue({
          code: 'custom',
          path: [`${prefix}_CLIENT_SECRET`],
          message: `${prefix}_CLIENT_ID and ${prefix}_CLIENT_SECRET must be set together`,
        })
      }
    }
  })
export type ConnectionsEnv = z.infer<typeof connectionsEnvSchema>

/** The `[clientId, clientSecret]` env pair of each app, for `toConfig`. */
export function connectionOauthApps(
  env: ConnectionsEnv,
): Partial<Record<ConnectionOauthAppKey, { clientId: string; clientSecret: string }>> {
  const apps: Partial<Record<ConnectionOauthAppKey, { clientId: string; clientSecret: string }>> =
    {}
  for (const key of CONNECTION_OAUTH_APP_KEYS) {
    const prefix = `CONNECTIONS_OAUTH_${ENV_PREFIX[key]}`
    const clientId = env[`${prefix}_CLIENT_ID` as keyof ConnectionsEnv]
    const clientSecret = env[`${prefix}_CLIENT_SECRET` as keyof ConnectionsEnv]
    if (clientId !== undefined && clientSecret !== undefined) {
      apps[key] = { clientId, clientSecret }
    }
  }
  return apps
}
