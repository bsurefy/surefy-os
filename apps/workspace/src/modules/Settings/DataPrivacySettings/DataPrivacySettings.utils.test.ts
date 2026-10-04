// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import {
  findScheduledDeletion,
  formatMegabytes,
  getExportActions,
} from './DataPrivacySettings.utils'
import { dataRequestFactory } from '../../../../mock/handlers/dataControl'

describe('getExportActions', () => {
  it('offers download for a ready export, retry for a failed one and cancel for a queued one', () => {
    expect(getExportActions(dataRequestFactory({ status: 'ready' }))).toEqual({
      canDownload: true,
      canRetry: false,
      canCancel: false,
    })
    expect(getExportActions(dataRequestFactory({ status: 'failed' })).canRetry).toBe(true)
    expect(getExportActions(dataRequestFactory({ status: 'requested' })).canCancel).toBe(true)
    expect(getExportActions(dataRequestFactory({ status: 'expired' })).canDownload).toBe(false)
  })
})

describe('findScheduledDeletion', () => {
  it('finds only a deletion that is scheduled', () => {
    const scheduled = dataRequestFactory({ type: 'deletion', status: 'scheduled' })
    expect(
      findScheduledDeletion([
        dataRequestFactory(),
        dataRequestFactory({ type: 'deletion', status: 'canceled' }),
        scheduled,
      ]),
    ).toBe(scheduled)
    expect(findScheduledDeletion([dataRequestFactory()])).toBeUndefined()
  })
})

describe('formatMegabytes', () => {
  it('rounds to one decimal', () => {
    expect(formatMegabytes(48_340_000)).toBeCloseTo(48.3, 5)
  })
})
