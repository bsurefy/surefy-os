// SPDX-License-Identifier: AGPL-3.0-only
// `pnpm --filter workspace dev:mock`: the dev mock server on the API port (testing.md §5).
import { readMockServerConfig } from './config'
import { CONTROL_PATH } from './controlPage'
import { mockDomains } from './handlers'
import { createMockServer, writeLine } from './server'

const config = readMockServerConfig()
const { server, mocked, passthrough } = createMockServer(mockDomains, config)

server.listen(config.port, () => {
  writeLine(`Mock server on http://localhost:${config.port}`)
  writeLine(`  mocked:      ${mocked.join(', ') || 'none'}`)
  writeLine(`  forwarded:   ${passthrough.join(', ') || 'none'} → ${config.upstreamUrl}`)
  writeLine(`  scenarios:   http://localhost:${config.port}${CONTROL_PATH}`)
})
