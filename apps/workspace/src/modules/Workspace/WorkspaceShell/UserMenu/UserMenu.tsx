// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Keyboard, Languages, LogOut, Palette, UserRound } from 'lucide-react'
import Link from 'next/link'

import { ROUTES } from '@/constants/routes'
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

/** The person's menu: profile, theme, language, shortcuts, sign out. */
export default function UserMenu({ orgSlug }: Readonly<{ orgSlug: string }>) {
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
      <DropdownMenuTrigger
        aria-label={t('label', { name: user.name })}
        className="focus-visible:ring-ring rounded-full outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      >
        <UserAvatar user={user} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
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
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Palette aria-hidden="true" />
            {t('theme')}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={theme} onValueChange={onThemeChange}>
              {themes.map((option) => (
                <DropdownMenuRadioItem key={option.value} value={option.value}>
                  {option.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
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
        <DropdownMenuItem onSelect={onSignOut}>
          <LogOut aria-hidden="true" />
          {t('signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
