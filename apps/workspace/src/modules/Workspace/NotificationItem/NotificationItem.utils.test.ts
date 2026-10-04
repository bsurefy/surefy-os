// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { getNotificationHref } from './NotificationItem.utils'

const id = '00000000-0021-4000-8000-000000000001'

describe('getNotificationHref', () => {
  it('opens the object when it has a page, otherwise the page that manages it', () => {
    expect(getNotificationHref({ type: 'approval', id }, 'acme')).toBe(
      `/acme/insights/approvals/${id}`,
    )
    expect(getNotificationHref({ type: 'chat', id }, 'acme')).toBe(`/acme/chat/${id}`)
    expect(getNotificationHref({ type: 'budget', id }, 'acme')).toBe('/acme/settings/usage')
    expect(getNotificationHref({ type: 'export', id }, 'acme')).toBe('/acme/settings/data-privacy')
  })

  it('has no link without a target', () => {
    expect(getNotificationHref(null, 'acme')).toBeNull()
  })
})
