// SPDX-License-Identifier: AGPL-3.0-only
import { Bot, MessageSquare, Settings, Shield } from 'lucide-react'

import { ROUTES } from '@/constants/routes'
import { FEATURES, PERMISSIONS } from '@surefy/contracts'

import type { NavEntry } from '@/modules/Workspace'

/** A navigation configuration for tests, independent of what the module skeleton registers. */
export const TEST_NAV: NavEntry[] = [
  {
    key: 'chat',
    group: 'build',
    icon: MessageSquare,
    href: (orgSlug) => ROUTES.workspace.chat(orgSlug),
    released: true,
    module: 'chat',
    anyPermission: [PERMISSIONS.CHAT_USE],
    goKey: 'c',
  },
  {
    key: 'agents',
    group: 'build',
    icon: Bot,
    href: (orgSlug) => ROUTES.workspace.agents(orgSlug),
    released: true,
    module: 'agents',
    anyPermission: [PERMISSIONS.VAULT_READ],
    goKey: 'a',
  },
  {
    key: 'flows',
    group: 'build',
    icon: Bot,
    href: (orgSlug) => ROUTES.workspace.flows(orgSlug),
    released: false,
    module: 'flows',
  },
  {
    key: 'guard',
    group: 'operate',
    icon: Shield,
    href: (orgSlug) => ROUTES.workspace.guard(orgSlug),
    released: true,
    feature: FEATURES.AUDIT_EXPORT,
    anyPermission: [PERMISSIONS.AUDIT_READ],
  },
  {
    key: 'settings',
    group: 'operate',
    icon: Settings,
    href: (orgSlug) => ROUTES.workspace.settings(orgSlug),
    released: true,
    anyPermission: [PERMISSIONS.MEMBERS_READ],
  },
]
