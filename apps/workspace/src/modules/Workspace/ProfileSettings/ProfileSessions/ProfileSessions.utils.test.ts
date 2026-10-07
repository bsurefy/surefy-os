// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { describeUserAgent } from './ProfileSessions.utils'

describe('describeUserAgent', () => {
  it('names the browser and the system', () => {
    expect(
      describeUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_2) AppleWebKit/605.1.15 Safari/605.1.15',
      ),
    ).toEqual({ browser: 'Safari', os: 'macOS' })
    expect(
      describeUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/132.0 Safari/537.36 Edg/132.0',
      ),
    ).toEqual({ browser: 'Edge', os: 'Windows' })
    expect(
      describeUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) Mobile/15E148 Safari/604.1',
      ),
    ).toEqual({ browser: 'Safari', os: 'iOS' })
  })

  it('gives up on missing or unknown agents', () => {
    expect(describeUserAgent(null)).toBeNull()
    expect(describeUserAgent('curl/8.0')).toBeNull()
  })
})
