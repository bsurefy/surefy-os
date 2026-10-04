// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

/**
 * OAuth providers are optional: a provider is enabled only when both its client ID and secret
 * are set. Self-hosted installs work with email and password alone.
 */
export const oauthEnvSchema = z
  .object({
    OAUTH_GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    OAUTH_GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
    OAUTH_MICROSOFT_CLIENT_ID: z.string().min(1).optional(),
    OAUTH_MICROSOFT_CLIENT_SECRET: z.string().min(1).optional(),
    OAUTH_MICROSOFT_TENANT_ID: z.string().min(1).default('common'),
    OAUTH_GITHUB_CLIENT_ID: z.string().min(1).optional(),
    OAUTH_GITHUB_CLIENT_SECRET: z.string().min(1).optional(),
  })
  .superRefine((env, ctx) => {
    for (const provider of ['GOOGLE', 'MICROSOFT', 'GITHUB'] as const) {
      const id = env[`OAUTH_${provider}_CLIENT_ID`]
      const secret = env[`OAUTH_${provider}_CLIENT_SECRET`]
      if ((id === undefined) !== (secret === undefined)) {
        ctx.addIssue({
          code: 'custom',
          path: [`OAUTH_${provider}_CLIENT_SECRET`],
          message: `OAUTH_${provider}_CLIENT_ID and OAUTH_${provider}_CLIENT_SECRET must be set together`,
        })
      }
    }
  })
export type OauthEnv = z.infer<typeof oauthEnvSchema>
