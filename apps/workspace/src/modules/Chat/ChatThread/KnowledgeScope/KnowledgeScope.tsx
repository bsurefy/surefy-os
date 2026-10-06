// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useInfiniteQuery } from '@tanstack/react-query'
import { BookOpen, ChevronDown } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { knowledgeQueries } from '@/api/knowledge'
import type { ChatKnowledgeScope } from '@surefy/contracts'
import { Button } from '@surefy/ui/primitives/button'
import { Checkbox } from '@surefy/ui/primitives/checkbox'
import { Label } from '@surefy/ui/primitives/label'
import { Popover, PopoverContent, PopoverTrigger } from '@surefy/ui/primitives/popover'
import { RadioGroup, RadioGroupItem } from '@surefy/ui/primitives/radio-group'

const KNOWLEDGE_LIMIT = 100
const SCOPES: readonly ChatKnowledgeScope[] = ['all', 'selected', 'none']

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
 * knowledge bases, or none. A base that is still indexing says so, since it is not searched yet.
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
      <PopoverContent align="start" className="flex w-80 flex-col gap-3">
        <p className="text-label">{t('title')}</p>
        <RadioGroup
          value={scope}
          onValueChange={(value) => {
            onChange(value as ChatKnowledgeScope, value === 'selected' ? [...selectedIds] : [])
          }}
        >
          {SCOPES.map((value) => (
            <div key={value} className="flex items-start gap-2">
              <RadioGroupItem id={`scope-${value}`} value={value} />
              <Label htmlFor={`scope-${value}`} className="flex flex-col gap-0.5">
                <span className="font-medium">{t(`options.${value}.name`)}</span>
                <span className="text-caption text-muted-foreground font-normal">
                  {t(`options.${value}.description`)}
                </span>
              </Label>
            </div>
          ))}
        </RadioGroup>
        {scope === 'selected' && (
          <ul aria-label={t('bases')} className="flex max-h-56 flex-col gap-2 overflow-y-auto">
            {bases.map((base) => (
              <li key={base.id} className="flex items-start gap-2">
                <Checkbox
                  id={`scope-base-${base.id}`}
                  checked={selectedIds.includes(base.id)}
                  onCheckedChange={(checked) => {
                    toggle(base.id, checked === true)
                  }}
                />
                <Label htmlFor={`scope-base-${base.id}`} className="flex flex-col gap-0.5">
                  <span>{base.name}</span>
                  {base.processing.inProgress > 0 && (
                    <span className="text-caption text-muted-foreground font-normal">
                      {t('indexing', { count: base.processing.inProgress })}
                    </span>
                  )}
                </Label>
              </li>
            ))}
            {bases.length === 0 && (
              <li className="text-caption text-muted-foreground">{t('noBases')}</li>
            )}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}
