// SPDX-License-Identifier: AGPL-3.0-only
import createNextIntlPlugin from 'next-intl/plugin'

import type { NextConfig } from 'next'

/** Where the API listens in development; production routes /api at the reverse proxy. */
const apiUrl = process.env.INTERNAL_API_URL ?? `http://localhost:${process.env.API_PORT ?? '4000'}`

const withNextIntl = createNextIntlPlugin('./src/core/i18n/request.ts')

const nextConfig: NextConfig = {
  transpilePackages: ['@surefy/contracts', '@surefy/ui', '@surefy/web-core'],
  experimental: {
    // `@surefy/contracts` is also compiled by the API under NodeNext, so its relative imports end
    // in `.js` and point at `.ts` files. Turbopack cannot map them, hence `--webpack` in the scripts.
    extensionAlias: { '.js': ['.ts', '.tsx', '.js'] },
  },
  typedRoutes: true,
  reactCompiler: true,
  poweredByHeader: false,
  // Do not let `next dev` write agent instruction files into the repository.
  agentRules: false,
  rewrites: () =>
    Promise.resolve(
      process.env.NODE_ENV === 'development'
        ? [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }]
        : [],
    ),
}

export default withNextIntl(nextConfig)
