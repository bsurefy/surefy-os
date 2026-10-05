// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { getDateGroup, getDaysLeft, groupChatsByDate } from './ChatList.utils'
import { chatFactory } from '../../../../mock/handlers/chat'

const NOW = new Date(2026, 9, 5, 15, 0)
const daysAgo = (days: number, hour = 9) => new Date(2026, 9, 5 - days, hour, 0)

describe('getDateGroup', () => {
  it.each([
    [0, 'today'],
    [1, 'yesterday'],
    [2, 'previous7'],
    [7, 'previous7'],
    [8, 'previous30'],
    [30, 'previous30'],
    [31, 'older'],
  ])('puts a chat from %i days ago in %s', (days, group) => {
    expect(getDateGroup(daysAgo(days), NOW)).toBe(group)
  })

  it('counts calendar days, not hours: 23:00 yesterday is yesterday at 00:30', () => {
    expect(getDateGroup(new Date(2026, 9, 4, 23, 0), new Date(2026, 9, 5, 0, 30))).toBe('yesterday')
  })
})

describe('groupChatsByDate', () => {
  it('keeps the order and drops empty groups', () => {
    const chats = [
      chatFactory({ title: 'a', lastMessageAt: daysAgo(0).toISOString() }),
      chatFactory({ title: 'b', lastMessageAt: daysAgo(0, 8).toISOString() }),
      chatFactory({ title: 'c', lastMessageAt: daysAgo(12).toISOString() }),
    ]
    const groups = groupChatsByDate(chats, NOW)
    expect(groups.map(({ key }) => key)).toEqual(['today', 'previous30'])
    expect(groups[0]?.chats.map(({ title }) => title)).toEqual(['a', 'b'])
  })

  it('files a chat without messages under its creation date', () => {
    const chat = chatFactory({ lastMessageAt: null, createdAt: daysAgo(1).toISOString() })
    expect(groupChatsByDate([chat], NOW)[0]?.key).toBe('yesterday')
  })
})

describe('getDaysLeft', () => {
  it('rounds up so the last day still reads "1 day left"', () => {
    expect(getDaysLeft(new Date(NOW.getTime() + 60 * 60 * 1000).toISOString(), NOW)).toBe(1)
  })

  it('never goes below zero', () => {
    expect(getDaysLeft(daysAgo(2).toISOString(), NOW)).toBe(0)
    expect(getDaysLeft(null, NOW)).toBe(0)
  })
})
