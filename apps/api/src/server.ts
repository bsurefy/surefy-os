// SPDX-License-Identifier: AGPL-3.0-only
import closeWithGrace from 'close-with-grace'

import { buildApp } from './app.js'

const host = process.env.API_HOST ?? '127.0.0.1'
const port = Number(process.env.API_PORT ?? 4000)

const app = await buildApp({ logLevel: process.env.LOG_LEVEL })
await app.listen({ host, port })

closeWithGrace({ delay: 10_000 }, async ({ err, signal }) => {
  if (err) app.log.error({ err }, 'fatal error, shutting down')
  else app.log.info({ signal }, 'shutting down')
  await app.close()
})
