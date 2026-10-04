// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useTranslations } from 'next-intl'

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@surefy/ui/primitives/sheet'

import { useShellOverlayStore } from '../../Workspace.store'
import NavList from '../NavList'
import OrgSwitcher from '../OrgSwitcher'
import SidebarFooter from '../SidebarFooter'

/** Below 768px the sidebar opens as a sheet from the top bar's menu button. */
export default function MobileNav({ orgSlug }: Readonly<{ orgSlug: string }>) {
  const t = useTranslations('workspace.shell')
  const isOpen = useShellOverlayStore((state) => state.open === 'mobileNav')
  const setOpen = useShellOverlayStore((state) => state.setOpen)
  const onOpenChange = (next: boolean) => {
    setOpen('mobileNav', next)
  }
  const onNavigate = () => {
    setOpen('mobileNav', false)
  }

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent side="left" size="sm" className="flex flex-col gap-4">
        <SheetHeader>
          <SheetTitle>{t('menuTitle')}</SheetTitle>
          <SheetDescription className="sr-only">{t('menuDescription')}</SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 px-3 pb-4">
          <OrgSwitcher orgSlug={orgSlug} />
          <nav
            aria-label={t('navLabel')}
            className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto"
          >
            <NavList orgSlug={orgSlug} onNavigate={onNavigate} />
          </nav>
          <SidebarFooter orgSlug={orgSlug} />
        </div>
      </SheetContent>
    </Sheet>
  )
}
