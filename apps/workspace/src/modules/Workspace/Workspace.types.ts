// SPDX-License-Identifier: AGPL-3.0-only
import type {
  EffectiveAccessDto,
  Feature,
  InstallCapabilitiesDto,
  InstallCapability,
  ModuleKey,
  Permission,
} from '@surefy/contracts'

import type { NAV_GROUPS, NAV_ITEM_KEYS } from './Workspace.constants'
import type { LucideIcon } from 'lucide-react'

/** Sidebar groups, in order: Build, Operate, then Settings on its own. */
export type NavGroup = (typeof NAV_GROUPS)[number]

/** Every sidebar item the design specifies; its label is `workspace.nav.items.<key>`. */
export type NavItemKey = (typeof NAV_ITEM_KEYS)[number]

/**
 * What a sidebar item, its command palette entry and its "g then …" shortcut need. Visibility is
 * computed from these requirements and effective access, never from role names
 * (authentication.md §5). Every requirement is optional; all the given ones must hold.
 */
export interface NavEntry {
  key: NavItemKey
  group: NavGroup
  icon: LucideIcon
  /** A builder from `ROUTES.workspace`; its first segment after the slug marks the item active. */
  href: (orgSlug: string) => string
  /** Hidden until the module works end to end (ADR 0019); its pages answer 404 meanwhile. */
  released: boolean
  /** Hidden when the module is off for the person's plan, organization or team. */
  module?: ModuleKey
  /** Shown when the person holds at least one of these permissions. */
  anyPermission?: readonly Permission[]
  /** Missing from the edition or plan: shown with a lock, or hidden with `hideWhenUnavailable`. */
  feature?: Feature
  hideWhenUnavailable?: boolean
  /** Shown only where the install offers this capability (ADR 0020). */
  installCapability?: InstallCapability
  /** Shown only to install administrators (self-hosted Install and License). */
  installAdminOnly?: boolean
  /** The second key of the "g then …" shortcut (`c` for Chat). */
  goKey?: string
}

export type NavVisibility = 'hidden' | 'visible' | 'locked'

/** A visible entry with its state for the current person. */
export interface VisibleNavEntry {
  entry: NavEntry
  isLocked: boolean
}

/** What visibility is decided from: effective access and the `GET /api/v1/me` session. */
export interface NavContext {
  access: EffectiveAccessDto
  install: InstallCapabilitiesDto
  isInstallAdmin: boolean
}

export type CommandGroup = 'goTo' | 'actions'

/**
 * One command palette entry contributed by a module (`commands` in the module's `index.ts`,
 * collected in `Workspace.commands.ts`). Commands navigate; a module opens its own dialogs from
 * the URL it lands on (`?invite=1`).
 */
export interface WorkspaceCommand {
  id: string
  group: CommandGroup
  /** Full message key, namespace included: `chat.commands.newChat`. */
  labelKey: string
  icon?: LucideIcon
  href: (orgSlug: string) => string
  /** Hidden with this sidebar item (unreleased, module off, no permission). */
  navKey?: NavItemKey
  /** Additional permission the command needs (at least one of them). */
  anyPermission?: readonly Permission[]
  /** Only where the install offers this capability. */
  installCapability?: InstallCapability
}

/** Places a page-level permission-denied state can name. */
export type NoAccessArea = NavItemKey | 'notifications'

/** One level of the top-bar breadcrumb below the module: the object, then its tab. */
export interface ShellCrumb {
  label: string
  href?: string
}
