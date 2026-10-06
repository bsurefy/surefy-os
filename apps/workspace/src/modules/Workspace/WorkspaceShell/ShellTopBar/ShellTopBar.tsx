// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Menu, Search } from 'lucide-react'
import Link from 'next/link'

import { Breadcrumbs } from '@surefy/ui/components/Navigation'
import { Button } from '@surefy/ui/primitives/button'
import { Kbd } from '@surefy/ui/primitives/kbd'

import NotificationsBell from '../NotificationsBell'
import { useShellTopBarController } from './ShellTopBar.controller'

/** The 56px top bar: menu (phones), breadcrumb, the centered search field, notifications. */
export default function ShellTopBar({ orgSlug }: Readonly<{ orgSlug: string }>) {
  const { trail, modifierKey, searchShortcut, onOpenSearch, onOpenMenu, t } =
    useShellTopBarController({ orgSlug })

  return (
    <header className="z-frame border-border bg-surface sticky top-0 flex h-14 shrink-0 items-center gap-2 border-b px-4 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,27.5rem)_minmax(0,1fr)] md:gap-4 md:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Button
          variant="ghost"
          size="icon-md"
          icon={Menu}
          aria-label={t('shell.openMenu')}
          onClick={onOpenMenu}
          className="md:hidden"
        />
        <Breadcrumbs label={t('shell.breadcrumbLabel')} items={trail} linkComponent={Link} />
      </div>
      <button
        type="button"
        aria-keyshortcuts="Meta+K Control+K"
        aria-label={t('shell.searchLabel', { shortcut: searchShortcut })}
        onClick={onOpenSearch}
        className="border-border bg-surface-2 text-body text-muted-foreground hover:border-input focus-visible:ring-ring duration-fast hidden h-9 w-full items-center gap-2.5 rounded-lg border pr-2 pl-3 text-left transition-colors outline-none focus-visible:ring-2 md:flex"
      >
        <Search aria-hidden="true" className="size-4 shrink-0" />
        <span className="flex-1 truncate">{t('shell.search')}</span>
        <span className="flex gap-1">
          <Kbd className="bg-surface text-foreground-secondary">{modifierKey}</Kbd>
          <Kbd className="bg-surface text-foreground-secondary">K</Kbd>
        </span>
      </button>
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="secondary"
          size="icon-md"
          icon={Search}
          aria-keyshortcuts="Meta+K Control+K"
          aria-label={t('shell.searchLabel', { shortcut: searchShortcut })}
          onClick={onOpenSearch}
          className="md:hidden"
        />
        <NotificationsBell orgSlug={orgSlug} />
      </div>
    </header>
  )
}
