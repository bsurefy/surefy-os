// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Check, ChevronsUpDown, Plus } from 'lucide-react'
import Link from 'next/link'

import { ROUTES } from '@/constants/routes'
import { FEATURES } from '@surefy/contracts'
import { EditionBadge } from '@surefy/ui/components/DataDisplay'
import { cn } from '@surefy/ui/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@surefy/ui/primitives/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@surefy/ui/primitives/dropdown-menu'
import { UpgradeCard } from '@surefy/web-core/access'

import { useOrgSwitcherController } from './OrgSwitcher.controller'
import { getInitials, toRoute } from '../../Workspace.utils'

import type { OrgSwitcherProps } from './OrgSwitcher.types'

/** Organization switcher at the top of the sidebar: logo, name and the person's role. */
export default function OrgSwitcher(props: Readonly<OrgSwitcherProps>) {
  const { isCollapsed = false } = props
  const {
    current,
    currentRole,
    options,
    createMode,
    upgradeEdition,
    isUpgradeOpen,
    setIsUpgradeOpen,
    t,
  } = useOrgSwitcherController(props)
  const name = current?.organization.name ?? ''

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={t('switcherLabel', { name })}
          className={cn(
            'hover:bg-surface-2 focus-visible:ring-ring flex h-10 w-full min-w-0 items-center gap-2 rounded-md px-1.5 text-left outline-none focus-visible:ring-2',
            isCollapsed && 'justify-center px-0',
          )}
        >
          <span
            aria-hidden="true"
            className="bg-primary text-primary-foreground text-label flex size-7 shrink-0 items-center justify-center rounded-md font-semibold"
          >
            {getInitials(name)}
          </span>
          {!isCollapsed && (
            <>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-body truncate font-medium">{name}</span>
                <span className="text-caption text-muted-foreground truncate">{currentRole}</span>
              </span>
              <ChevronsUpDown
                aria-hidden="true"
                className="text-muted-foreground size-4 shrink-0"
              />
            </>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>{t('heading')}</DropdownMenuLabel>
          {options.map((option) => (
            <DropdownMenuItem key={option.id} asChild>
              <Link
                href={toRoute(option.href)}
                aria-current={option.isCurrent ? 'true' : undefined}
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{option.name}</span>
                  <span className="text-caption text-muted-foreground">{option.role}</span>
                </span>
                {option.isCurrent && <Check aria-hidden="true" className="size-4" />}
              </Link>
            </DropdownMenuItem>
          ))}
          {createMode !== 'hidden' && <DropdownMenuSeparator />}
          {createMode === 'create' && (
            <DropdownMenuItem asChild>
              <Link href={toRoute(ROUTES.auth.organizations)}>
                <Plus aria-hidden="true" />
                {t('create')}
              </Link>
            </DropdownMenuItem>
          )}
          {createMode === 'upgrade' && (
            <DropdownMenuItem
              onSelect={() => {
                setIsUpgradeOpen(true)
              }}
            >
              <Plus aria-hidden="true" />
              <span className="flex-1">{t('create')}</span>
              <EditionBadge label={upgradeEdition} />
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={isUpgradeOpen} onOpenChange={setIsUpgradeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('create')}</DialogTitle>
            <DialogDescription>{t('upgradeHint')}</DialogDescription>
          </DialogHeader>
          <UpgradeCard feature={FEATURES.MULTI_ORGANIZATION} headingLevel={3} />
        </DialogContent>
      </Dialog>
    </>
  )
}
