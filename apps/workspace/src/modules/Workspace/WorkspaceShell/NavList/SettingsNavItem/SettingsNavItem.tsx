// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { ChevronDown } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@surefy/ui/lib/utils'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@surefy/ui/primitives/collapsible'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@surefy/ui/primitives/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@surefy/ui/primitives/tooltip'

import { useSettingsNavItemController } from './SettingsNavItem.controller'
import { toRoute } from '../../../Workspace.utils'

import type { SettingsNavItemProps } from './SettingsNavItem.types'

const rowClassName =
  'text-body text-foreground-secondary duration-fast hover:bg-surface-2 hover:text-foreground flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left transition-colors'
const activeClassName =
  'bg-sidebar-active text-sidebar-active-foreground hover:bg-sidebar-active hover:text-sidebar-active-foreground font-medium'

/**
 * The sidebar's Settings entry: a dropdown of the settings sections the person may open. Expanded,
 * it folds open under the row; on the icon rail it opens as a menu beside it. The inner part is
 * keyed by whether the page is a settings page, so it opens by itself on arrival.
 */
export default function SettingsNavItem(props: Readonly<SettingsNavItemProps>) {
  const pathname = usePathname()
  const isOnSettings =
    pathname === `/${props.orgSlug}/settings` || pathname.startsWith(`/${props.orgSlug}/settings/`)
  return <SettingsDropdown key={String(isOnSettings)} isOnSettings={isOnSettings} {...props} />
}

function SettingsDropdown({
  orgSlug,
  icon: Icon,
  isCollapsed = false,
  onNavigate,
  isOnSettings,
}: Readonly<SettingsNavItemProps & { isOnSettings: boolean }>) {
  const { sections, isOpen, setIsOpen, label } = useSettingsNavItemController({
    orgSlug,
    isOnSettings,
  })

  if (isCollapsed) {
    return (
      <li>
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={label}
                  className={cn(
                    rowClassName,
                    'justify-center px-0',
                    isOnSettings && activeClassName,
                  )}
                >
                  <Icon aria-hidden="true" className="size-5 shrink-0" />
                </button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="right">{label}</TooltipContent>
          </Tooltip>
          <DropdownMenuContent side="right" align="start" sideOffset={8} className="w-56">
            <DropdownMenuLabel className="text-overline text-muted-foreground">
              {label}
            </DropdownMenuLabel>
            {sections.map((section) => (
              <DropdownMenuItem key={section.id} asChild>
                <Link
                  href={toRoute(section.href)}
                  aria-current={section.isActive ? 'page' : undefined}
                  onClick={onNavigate}
                  className={cn(section.isActive && 'font-medium')}
                >
                  <span className="flex-1 truncate">{section.label}</span>
                  {section.hint && (
                    <span className="text-caption text-muted-foreground">{section.hint}</span>
                  )}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </li>
    )
  }

  return (
    <li>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className={cn('group', rowClassName, isOnSettings && !isOpen && activeClassName)}
          >
            <Icon aria-hidden="true" className="size-5 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{label}</span>
            <ChevronDown
              aria-hidden="true"
              className="text-muted-foreground duration-fast size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180"
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ul className="border-sidebar-border mt-0.5 ml-[1.375rem] flex flex-col gap-0.5 border-l pl-2">
            {sections.map((section) => (
              <li key={section.id}>
                <Link
                  href={toRoute(section.href)}
                  aria-current={section.isActive ? 'page' : undefined}
                  onClick={onNavigate}
                  className={cn(
                    'text-body text-foreground-secondary duration-fast hover:bg-surface-2 hover:text-foreground flex h-8 items-center gap-2 rounded-lg px-2.5 transition-colors',
                    section.isActive && activeClassName,
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{section.label}</span>
                  {section.hint && (
                    <span className="text-caption text-muted-foreground shrink-0">
                      {section.hint}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </li>
  )
}
