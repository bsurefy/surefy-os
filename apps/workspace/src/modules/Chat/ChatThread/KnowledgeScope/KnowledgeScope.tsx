// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useInfiniteQuery } from '@tanstack/react-query'
import { BookOpen, BookX, Check, ChevronDown, Library, ListChecks } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { knowledgeQueries } from '@/api/knowledge'
import type { ChatKnowledgeScope } from '@surefy/contracts'
import { IconTile } from '@surefy/ui/components/DataDisplay'
import { cn } from '@surefy/ui/lib/utils'
import { Button } from '@surefy/ui/primitives/button'
import { Checkbox } from '@surefy/ui/primitives/checkbox'
import { Label } from '@surefy/ui/primitives/label'
import { Popover, PopoverContent, PopoverTrigger } from '@surefy/ui/primitives/popover'
import { RadioGroup, RadioGroupItem } from '@surefy/ui/primitives/radio-group'

const KNOWLEDGE_LIMIT = 100
const SCOPES: readonly ChatKnowledgeScope[] = ['all', 'selected', 'none']
const SCOPE_ICONS = { all: Library, selected: ListChecks, none: BookX } as const

export interface KnowledgeScopeProps {
  orgId: string
  scope: ChatKnowledgeScope
  selectedIds: readonly string[]
  isDisabled?: boolean
  /** `chip`: a small pill for a toolbar. Default `button`. */
  variant?: 'button' | 'chip'
  onChange: (scope: ChatKnowledgeScope, selectedIds: string[]) => void
}

/**
 * The knowledge the chat may search: everything the person can read (the default), a selection of
 * knowledge bases, or none. The three scopes are rows; the knowledge bases follow as a checklist,
 * and ticking one switches to the selection on its own. A base that is still indexing says so,
 * since it is not searched yet.
 */
export default function KnowledgeScope({
  orgId,
  scope,
  selectedIds,
  isDisabled = false,
  variant = 'button',
  onChange,
}: Readonly<KnowledgeScopeProps>) {
  const t = useTranslations('chat.thread.scope')
  const query = useInfiniteQuery(knowledgeQueries.list(orgId, { limit: KNOWLEDGE_LIMIT }))
  const bases = query.data?.pages.flatMap((page) => page.items) ?? []

  const label =
    scope === 'selected' ? t('selected', { count: selectedIds.length }) : t(`label.${scope}`)

  const toggle = (baseId: string, isChecked: boolean) => {
    onChange(
      'selected',
      isChecked ? [...selectedIds, baseId] : selectedIds.filter((id) => id !== baseId),
    )
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="secondary"
          size={variant === 'chip' ? 'sm' : 'md'}
          disabled={isDisabled}
          aria-label={t('trigger')}
          className={variant === 'chip' ? 'text-caption h-7 rounded-full px-2.5' : undefined}
        >
          <BookOpen aria-hidden className={variant === 'chip' ? 'size-3.5' : 'size-4'} />
          <span className="truncate">{label}</span>
          {variant === 'chip' && (
            <ChevronDown aria-hidden className="text-muted-foreground size-3.5 shrink-0" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-80 flex-col p-1.5">
        <p className="text-overline text-muted-foreground px-2.5 pt-1.5 pb-1">{t('title')}</p>
        <RadioGroup
          value={scope}
          className="gap-0.5"
          onValueChange={(value) => {
            onChange(value as ChatKnowledgeScope, value === 'selected' ? [...selectedIds] : [])
          }}
        >
          {SCOPES.map((value) => {
            const isChecked = scope === value
            return (
              <Label
                key={value}
                htmlFor={`scope-${value}`}
                className={cn(
                  'hover:bg-surface-2 flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 font-normal',
                  isChecked && 'bg-primary-soft text-primary-soft-foreground hover:bg-primary-soft',
                )}
              >
                <RadioGroupItem id={`scope-${value}`} value={value} className="sr-only" />
                <IconTile
                  icon={SCOPE_ICONS[value]}
                  size="sm"
                  tone={isChecked ? 'primary' : 'neutral'}
                />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-label font-medium">{t(`options.${value}.name`)}</span>
                  <span className="text-caption text-muted-foreground">
                    {t(`options.${value}.description`)}
                  </span>
                </span>
                {isChecked && <Check aria-hidden className="text-primary size-4 shrink-0" />}
              </Label>
            )
          })}
        </RadioGroup>
        <div className="bg-border my-1.5 h-px" />
        <div className="flex items-center justify-between px-2.5 pt-1 pb-1">
          <p className="text-overline text-muted-foreground">{t('bases')}</p>
          {selectedIds.length > 0 && (
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0"
              onClick={() => {
                onChange('selected', [])
              }}
            >
              {t('clear')}
            </Button>
          )}
        </div>
        <ul aria-label={t('bases')} className="flex max-h-56 flex-col gap-0.5 overflow-y-auto">
          {bases.map((base) => (
            <li key={base.id}>
              <Label
                htmlFor={`scope-base-${base.id}`}
                className="hover:bg-surface-2 flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 font-normal"
              >
                <Checkbox
                  id={`scope-base-${base.id}`}
                  checked={selectedIds.includes(base.id)}
                  onCheckedChange={(checked) => {
                    toggle(base.id, checked === true)
                  }}
                />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-label truncate">{base.name}</span>
                  <span className="text-caption text-muted-foreground">
                    {t('sources', { count: base.sourceCount })}
                    {base.processing.inProgress > 0 &&
                      ` · ${t('indexing', { count: base.processing.inProgress })}`}
                  </span>
                </span>
              </Label>
            </li>
          ))}
          {bases.length === 0 && (
            <li className="text-caption text-muted-foreground px-2.5 py-1.5">{t('noBases')}</li>
          )}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
