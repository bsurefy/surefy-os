// SPDX-License-Identifier: AGPL-3.0-only
import { ROUTES } from '@/constants/routes'
import type { Permission } from '@surefy/contracts'
import {
  hasInstallCapability,
  getFeatureStatus,
  hasModule,
  hasPermission,
} from '@surefy/web-core/access'

import type {
  NavContext,
  NavEntry,
  NavItemKey,
  NavVisibility,
  VisibleNavEntry,
  WorkspaceCommand,
} from './Workspace.types'
import type { Route } from 'next'

const SEGMENT_INDEX = 2

function holdsAny(context: NavContext, permissions: readonly Permission[] | undefined): boolean {
  if (permissions === undefined || permissions.length === 0) return true
  return permissions.some((permission) => hasPermission(context.access, permission))
}

/**
 * Whether the person sees a navigation entry, and whether it carries the lock. Unreleased
 * entries, modules switched off, missing permissions, install capabilities and install
 * administration hide it; a feature missing from the edition locks it unless it asks to hide.
 */
export function getNavVisibility(entry: NavEntry, context: NavContext): NavVisibility {
  if (!entry.released) return 'hidden'
  if (entry.module !== undefined && !hasModule(context.access, entry.module)) return 'hidden'
  if (!holdsAny(context, entry.anyPermission)) return 'hidden'
  if (
    entry.installCapability !== undefined &&
    !hasInstallCapability(context.install, entry.installCapability)
  ) {
    return 'hidden'
  }
  if (entry.installAdminOnly === true && !context.isInstallAdmin) return 'hidden'
  if (entry.feature !== undefined) {
    const status = getFeatureStatus(context.access, entry.feature)
    if (status === 'unavailable') return entry.hideWhenUnavailable === true ? 'hidden' : 'locked'
  }
  return 'visible'
}

/** The entries the person sees, in configuration order. */
export function getVisibleNav(
  entries: readonly NavEntry[],
  context: NavContext,
): VisibleNavEntry[] {
  return entries.flatMap((entry) => {
    const visibility = getNavVisibility(entry, context)
    return visibility === 'hidden' ? [] : [{ entry, isLocked: visibility === 'locked' }]
  })
}

/** The first path segment after the organization: `/acme/agents/a1` → `agents`. */
export function getPathSegment(pathname: string): string | undefined {
  return pathname.split('/')[SEGMENT_INDEX]
}

/** The entry whose pages contain `pathname`, if any. */
export function getActiveNavEntry<Item extends { entry: NavEntry }>(
  items: readonly Item[],
  pathname: string,
  orgSlug: string,
): Item | undefined {
  const segment = getPathSegment(pathname)
  if (segment === undefined) return undefined
  return items.find((item) => getPathSegment(item.entry.href(orgSlug)) === segment)
}

/**
 * A path built with `ROUTES` and kept in data (navigation entries, commands, notification
 * targets), for `<Link>` and `router.push`. Typed routes check only literal paths at the call
 * site, and several of these pages arrive with later modules.
 */
export function toRoute(path: string): Route {
  return path as Route
}

/** Where the organization opens: Chat. */
export function getHomeHref(orgSlug: string) {
  return ROUTES.workspace.home(orgSlug)
}

/**
 * Where switching organization leads (navigation.md §3): the same module in the other
 * organization, or the same personal page, otherwise its home. Details (an agent, a chat) never
 * carry over, since they belong to the first organization.
 */
export function getSwitchOrgHref(
  pathname: string,
  toSlug: string,
  entries: readonly NavEntry[],
): string {
  const segment = getPathSegment(pathname)
  if (segment === getPathSegment(ROUTES.workspace.notifications(toSlug))) {
    return ROUTES.workspace.notifications(toSlug)
  }
  if (segment === getPathSegment(ROUTES.workspace.profile(toSlug))) {
    return ROUTES.workspace.profile(toSlug)
  }
  const entry = entries.find(
    (item) => item.released && getPathSegment(item.href(toSlug)) === segment,
  )
  return entry ? entry.href(toSlug) : getHomeHref(toSlug)
}

/** Whether a module command is offered: its sidebar item is visible and its own needs hold. */
export function isCommandAvailable(
  command: WorkspaceCommand,
  visibleKeys: ReadonlySet<NavItemKey>,
  context: NavContext,
): boolean {
  if (command.navKey !== undefined && !visibleKeys.has(command.navKey)) return false
  if (!holdsAny(context, command.anyPermission)) return false
  return (
    command.installCapability === undefined ||
    hasInstallCapability(context.install, command.installCapability)
  )
}

/** Whether a key press happens while the person is typing, where single-key shortcuts stay off. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

/** Initials for an avatar fallback: "Maya Okafor" → "MO". */
export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : ''
  return `${first}${last}`.toUpperCase()
}
