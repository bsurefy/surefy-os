// SPDX-License-Identifier: AGPL-3.0-only
/// <reference types="node" />
import 'server-only'
import { z } from 'zod'

import { createEnv } from './createEnv'

/** web-core's own server variables. The apps never pass the internal API URL around. */
export const serverEnv = createEnv({
  server: { INTERNAL_API_URL: z.url() },
  client: {},
  runtimeEnv: { INTERNAL_API_URL: process.env.INTERNAL_API_URL },
})
