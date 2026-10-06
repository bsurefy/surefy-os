// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Keyboard, Languages, LogOut, UserRound } from 'lucide-react'
import Link from 'next/link'

import { ROUTES } from '@/constants/routes'
import { cn } from '@surefy/ui/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@surefy/ui/primitives/dropdown-menu'

import { useUserMenuController } from './UserMenu.controller'
import UserAvatar from '../../UserAvatar'

import type { UserMenuProps } from './UserMenu.types'

/** The person's menu: profile, theme, language, shortcuts, sign out. */
export default function UserMenu({
  orgSlug,
  trigger,
  side = 'bottom',
  align = 'end',
}: Readonly<UserMenuProps>) {
  const {
    user,
    theme,
    themes,
    onThemeChange,
    locale,
    locales,
    onLocaleChange,
    onOpenShortcuts,
    onSignOut,
    t,
  } = useUserMenuController()
  if (!user) return null

  return (
    <DropdownMenu>
      {trigger ? (
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      ) : (
        <DropdownMenuTrigger
          aria-label={t('label', { name: user.name })}
          className="focus-visible:ring-ring rounded-full outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          <UserAvatar user={user} />
        </DropdownMenuTrigger>
      )}
      <DropdownMenuContent side={side} align={align} sideOffset={8} className="w-62">
        <DropdownMenuLabel className="flex flex-col">
          <span className="text-body truncate font-medium">{user.name}</span>
          <span className="text-caption text-muted-foreground truncate">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={ROUTES.workspace.profile(orgSlug)}>
            <UserRound aria-hidden="true" />
            {t('profile')}
          </Link>
        </DropdownMenuItem>
        <div className="flex items-center justify-between gap-3 px-2 py-1.5">
          <span className="text-body">{t('theme')}</span>
          <DropdownMenuRadioGroup
            value={theme}
            onValueChange={onThemeChange}
            aria-label={t('theme')}
            className="border-border bg-surface-2 flex h-7 items-stretch gap-0.5 rounded-lg border p-0.5"
          >
            {themes.map((option) => (
              <DropdownMenuRadioItem
                key={option.value}
                value={option.value}
                onSelect={(event) => {
                  // choosing a theme keeps the menu open
                  event.preventDefault()
                }}
                className={cn(
                  'text-label text-foreground-secondary focus:bg-surface focus:text-foreground data-[state=checked]:bg-surface data-[state=checked]:text-foreground data-[state=checked]:border-border flex cursor-default items-center rounded-md border border-transparent px-2 py-0 pl-2 data-[state=checked]:shadow-xs [&>span:first-child]:hidden',
                )}
              >
                {option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </div>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Languages aria-hidden="true" />
            {t('language')}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={locale} onValueChange={onLocaleChange}>
              {locales.map((option) => (
                <DropdownMenuRadioItem key={option.value} value={option.value} lang={option.value}>
                  {option.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem onSelect={onOpenShortcuts}>
          <Keyboard aria-hidden="true" />
          {t('shortcuts')}
          <DropdownMenuShortcut>?</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onSignOut}>
          <LogOut aria-hidden="true" />
          {t('signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
