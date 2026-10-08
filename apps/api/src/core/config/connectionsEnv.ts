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
 */
export const CONNECTION_OAUTH_APP_KEYS = ['google-drive', 'notion', 'slack'] as const
export type ConnectionOauthAppKey = (typeof CONNECTION_OAUTH_APP_KEYS)[number]

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
    CONNECTIONS_LOCAL_HOSTS: z.string().default(''),
  })
  .superRefine((env, ctx) => {
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
