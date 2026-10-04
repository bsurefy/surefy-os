// SPDX-License-Identifier: AGPL-3.0-only
import type { NextConfig } from 'next'

/** Where the API listens in development; production routes /api at the reverse proxy. */
const apiUrl = process.env.INTERNAL_API_URL ?? `http://localhost:${process.env.API_PORT ?? '4000'}`

const nextConfig: NextConfig = {
  transpilePackages: ['@surefy/contracts', '@surefy/ui', '@surefy/web-core'],
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

export default nextConfig
