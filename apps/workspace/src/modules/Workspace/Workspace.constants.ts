// SPDX-License-Identifier: AGPL-3.0-only
import { BookOpen, ChartLine, MessageSquare, Settings, Shield } from 'lucide-react'

import { ROUTES } from '@/constants/routes'
// The file itself, not the module entry: that entry carries server guards, and this list is
// also read in the browser
import { SETTINGS_PERMISSIONS } from '@/modules/Settings/Settings.constants'
import { PERMISSIONS } from '@surefy/contracts'

import type { NavEntry } from './Workspace.types'

/** Sidebar groups in display order (design/workspace/navigation.md §2). */
export const NAV_GROUPS = ['build', 'operate', 'settings'] as const

/** Every sidebar item of the design, in display order; labels live in `workspace.nav.items`. */
export const NAV_ITEM_KEYS = [
  'chat',
  'agents',
  'flows',
  'pieces',
  'knowledge',
  'train',
  'insights',
  'guard',
  'settings',
] as const

/**
 * The workspace navigation (pages-routing.md §8). The sidebar, the command palette's "Go to"
 * group and the "g then …" shortcuts are built from it, filtered by effective access. The module
 * skeleton adds one entry per MVP module with `released: false`; each module flips its own flag
 * in its integration task. Entries are listed in display order within their group.
 */
export const WORKSPACE_NAV: readonly NavEntry[] = [
  {
    key: 'chat',
    group: 'build',
    icon: MessageSquare,
    href: (orgSlug) => ROUTES.workspace.chat(orgSlug),
    released: false,
    module: 'chat',
    anyPermission: [PERMISSIONS.CHAT_USE],
    goKey: 'c',
  },
  {
    key: 'knowledge',
    group: 'build',
    icon: BookOpen,
    href: (orgSlug) => ROUTES.workspace.knowledge(orgSlug),
    released: false,
    module: 'knowledge',
    // Builders and above; Users search knowledge only from Chat
    anyPermission: [PERMISSIONS.KNOWLEDGE_UPLOAD],
    goKey: 'k',
  },
  {
    key: 'insights',
    group: 'operate',
    icon: ChartLine,
    href: (orgSlug) => ROUTES.workspace.insights(orgSlug),
    released: false,
    module: 'insights',
    anyPermission: [PERMISSIONS.INSIGHTS_READ],
    goKey: 'i',
  },
  {
    key: 'guard',
    group: 'operate',
    icon: Shield,
    // The audit log is Guard's only tab in the MVP
    href: (orgSlug) => ROUTES.workspace.guard(orgSlug, 'audit-log'),
    released: true,
    module: 'guard',
    anyPermission: [PERMISSIONS.AUDIT_READ],
  },
  {
    key: 'settings',
    group: 'settings',
    icon: Settings,
    href: (orgSlug) => ROUTES.workspace.settings(orgSlug),
    released: false,
    anyPermission: SETTINGS_PERMISSIONS,
  },
]

/** The sidebar's collapsed preference; a per-device choice, never server data. */
export const SIDEBAR_STORAGE_KEY = 'surefy:sidebar'

/** At this width and wider the sidebar is expanded unless the person collapsed it. */
export const DESKTOP_MEDIA_QUERY = '(min-width: 1280px)'

/** How long the "g then …" shortcut waits for its second key. */
export const GO_SEQUENCE_TIMEOUT_MS = 1000

/** The notifications popover shows this many of the latest items. */
export const NOTIFICATIONS_POPOVER_LIMIT = 5

/** The bell's unread count refreshes this often while the page is open. */
export const UNREAD_COUNT_REFRESH_MS = 60_000
