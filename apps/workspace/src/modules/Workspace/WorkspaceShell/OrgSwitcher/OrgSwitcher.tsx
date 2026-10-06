// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Check, Plus } from 'lucide-react'
import Link from 'next/link'

import { ROUTES } from '@/constants/routes'
import { EditionBadge, MonoTile } from '@surefy/ui/components/DataDisplay'
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@surefy/ui/primitives/dropdown-menu'

import { useOrgSwitcherController } from './OrgSwitcher.controller'
import { getInitials, toRoute } from '../../Workspace.utils'

import type { OrgSwitcherProps } from './OrgSwitcher.types'

/**
 * The organization section of the user menu: every organization with the person's role, and
 * "Create organization". The switcher is not in the sidebar, since people rarely change organization.
 */
export default function OrgSwitcher({ orgSlug, onUpgrade }: Readonly<OrgSwitcherProps>) {
  const { options, createMode, upgradeEdition, t } = useOrgSwitcherController({ orgSlug })
  if (options.length === 0) return null

  return (
    <>
      <DropdownMenuLabel className="text-overline text-muted-foreground">
        {t('heading', { count: options.length })}
      </DropdownMenuLabel>
      {options.map((option) => (
        <DropdownMenuItem key={option.id} asChild>
          <Link
            href={toRoute(option.href)}
            aria-current={option.isCurrent ? 'true' : undefined}
            className="h-11"
          >
            <MonoTile>{getInitials(option.name)}</MonoTile>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-label truncate font-medium">{option.name}</span>
              <span className="text-caption text-muted-foreground">{option.role}</span>
            </span>
            {option.isCurrent && <Check aria-hidden="true" className="text-primary size-4" />}
          </Link>
        </DropdownMenuItem>
      ))}
      {createMode === 'create' && (
        <DropdownMenuItem asChild>
          <Link href={toRoute(ROUTES.auth.organizations)}>
            <Plus aria-hidden="true" />
            {t('create')}
          </Link>
        </DropdownMenuItem>
      )}
      {createMode === 'upgrade' && (
        <DropdownMenuItem onSelect={onUpgrade}>
          <Plus aria-hidden="true" />
          <span className="flex-1">{t('create')}</span>
          <EditionBadge label={upgradeEdition} />
        </DropdownMenuItem>
      )}
      <DropdownMenuSeparator />
    </>
  )
}
