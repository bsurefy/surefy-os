// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Menu, Search } from 'lucide-react'
import Link from 'next/link'

import { Breadcrumbs } from '@surefy/ui/components/Navigation'
import { Button } from '@surefy/ui/primitives/button'
import { Kbd } from '@surefy/ui/primitives/kbd'

import NotificationsBell from '../NotificationsBell'
import UserMenu from '../UserMenu'
import { useShellTopBarController } from './ShellTopBar.controller'

/** The 56px top bar: menu (phones), breadcrumb, search, notifications, user menu. */
export default function ShellTopBar({ orgSlug }: Readonly<{ orgSlug: string }>) {
  const { trail, searchShortcut, onOpenSearch, onOpenMenu, t } = useShellTopBarController({
    orgSlug,
  })

  return (
    <header className="z-frame border-border bg-background sticky top-0 flex h-14 shrink-0 items-center gap-2 border-b px-4 md:px-6">
      <Button
        variant="ghost"
        size="icon-md"
        icon={Menu}
        aria-label={t('shell.openMenu')}
        onClick={onOpenMenu}
        className="md:hidden"
      />
      <Breadcrumbs
        label={t('shell.breadcrumbLabel')}
        items={trail}
        linkComponent={Link}
        className="flex-1"
      />
      <Button
        variant="secondary"
        size="md"
        icon={Search}
        aria-keyshortcuts="Meta+K Control+K"
        aria-label={t('shell.searchLabel', { shortcut: searchShortcut })}
        onClick={onOpenSearch}
        className="max-sm:size-9 max-sm:px-0"
      >
        <span className="text-muted-foreground max-sm:hidden">{t('shell.search')}</span>
        <Kbd className="max-sm:hidden">{searchShortcut}</Kbd>
      </Button>
      <NotificationsBell orgSlug={orgSlug} />
      <UserMenu orgSlug={orgSlug} />
    </header>
  )
}
