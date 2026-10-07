// SPDX-License-Identifier: AGPL-3.0-only
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'

import { ROUTES } from '@/constants/routes'
import type { BreadcrumbItem } from '@surefy/ui/components/Navigation'

import { useMe, useModifierKeyLabel, useVisibleNav } from '../../Workspace.hooks'
import { useShellCrumbStore, useShellOverlayStore } from '../../Workspace.store'
import { getActiveNavEntry, getHomeHref, getPathSegment } from '../../Workspace.utils'

/**
 * The top bar's breadcrumb: Organization / Module / the object levels the page set
 * (`PageBreadcrumb`). The personal pages stand in for the module.
 */
export function useShellTopBarController({ orgSlug }: { orgSlug: string }) {
  const t = useTranslations('workspace')
  const pathname = usePathname()
  const { data: me } = useMe()
  const items = useVisibleNav()
  const crumbs = useShellCrumbStore((state) => state.crumbs)
  const setOverlay = useShellOverlayStore((state) => state.setOpen)
  const modifierKey = useModifierKeyLabel()

  const org = me?.memberships.find((membership) => membership.organization.slug === orgSlug)
  const segment = getPathSegment(pathname)
  const active = items ? getActiveNavEntry(items, pathname, orgSlug) : undefined

  const trail: BreadcrumbItem[] = []
  if (org) trail.push({ label: org.organization.name, href: getHomeHref(orgSlug) })
  if (active) {
    trail.push({ label: t(`nav.items.${active.entry.key}`), href: active.entry.href(orgSlug) })
  } else if (segment === getPathSegment(ROUTES.workspace.notifications(orgSlug))) {
    trail.push({ label: t('notifications.title'), href: ROUTES.workspace.notifications(orgSlug) })
  } else if (segment === getPathSegment(ROUTES.workspace.profile(orgSlug))) {
    trail.push({ label: t('profile.title'), href: ROUTES.workspace.profile(orgSlug) })
  }
  trail.push(...crumbs)

  return {
    trail,
    modifierKey,
    searchShortcut: `${modifierKey} K`,
    onOpenSearch: () => {
      setOverlay('commands', true)
    },
    onOpenMenu: () => {
      setOverlay('mobileNav', true)
    },
    t,
  }
}
