// SPDX-License-Identifier: AGPL-3.0-only
import type { ChatDto } from '@surefy/contracts'

import { DAYS_PREVIOUS_MONTH, DAYS_PREVIOUS_WEEK } from './ChatList.constants'

import type { DateGroup } from './ChatList.constants'

const DAY_MS = 24 * 60 * 60 * 1000

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/** The date a chat is filed under: its last message, or its creation while it has none. */
export function getChatDate(chat: ChatDto): Date {
  return new Date(chat.lastMessageAt ?? chat.createdAt)
}

/** Which group of the list a moment falls in, counted in whole local days back from `now`. */
export function getDateGroup(date: Date, now: Date): DateGroup {
  const daysBack = Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS)
  if (daysBack <= 0) return 'today'
  if (daysBack === 1) return 'yesterday'
  if (daysBack <= DAYS_PREVIOUS_WEEK) return 'previous7'
  if (daysBack <= DAYS_PREVIOUS_MONTH) return 'previous30'
  return 'older'
}

export interface ChatGroup {
  key: DateGroup
  chats: ChatDto[]
}

/** Splits chats (already newest first) into the date groups that have any, in display order. */
export function groupChatsByDate(chats: readonly ChatDto[], now: Date): ChatGroup[] {
  const groups: ChatGroup[] = []
  for (const chat of chats) {
    const key = getDateGroup(getChatDate(chat), now)
    const last = groups.at(-1)
    if (last?.key === key) last.chats.push(chat)
    else groups.push({ key, chats: [chat] })
  }
  return groups
}

/** Whole days until a deleted chat is removed for good; never below 0. */
export function getDaysLeft(purgeAt: string | null, now: Date): number {
  if (!purgeAt) return 0
  return Math.max(0, Math.ceil((new Date(purgeAt).getTime() - now.getTime()) / DAY_MS))
}
