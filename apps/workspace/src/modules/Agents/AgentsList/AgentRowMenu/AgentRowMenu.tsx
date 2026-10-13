// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Ellipsis } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@surefy/ui/primitives/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@surefy/ui/primitives/dropdown-menu'

import { getRowActions } from '../AgentsList.utils'

import type { AgentRowMenuProps } from './AgentRowMenu.types'

/** The "⋯" menu of an agent: Duplicate, Pause or Resume, Archive or Restore, Delete…. */
export default function AgentRowMenu({ agent, canCreate, onAction }: Readonly<AgentRowMenuProps>) {
  const t = useTranslations('agents.list')
  const actions = getRowActions(agent, canCreate)
  if (actions.length === 0) return null
  const hasDelete = actions.includes('delete')
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={t('rowActions', { name: agent.name })}>
          <Ellipsis aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {actions
          .filter((action) => action !== 'delete')
          .map((action) => (
            <DropdownMenuItem
              key={action}
              onSelect={() => {
                onAction(action, agent)
              }}
            >
              {t(`actions.${action}`)}
            </DropdownMenuItem>
          ))}
        {hasDelete && (
          <>
            {actions.length > 1 && <DropdownMenuSeparator />}
            <DropdownMenuItem
              className="text-destructive"
              onSelect={() => {
                onAction('delete', agent)
              }}
            >
              {t('actions.delete')}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
