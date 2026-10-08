// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Pencil, Plus, Trash2, X } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { PII_ACTIONS } from '@surefy/contracts'
import type { DataFilterTypeDto, PiiAction, PiiRuleDto } from '@surefy/contracts'
import { Tag } from '@surefy/ui/components/DataDisplay'
import { SegmentedControl } from '@surefy/ui/components/Forms'
import { Button } from '@surefy/ui/primitives/button'

import { getExceptionTarget } from '../DataFilters.utils'

interface FilterTypeRowProps {
  line: DataFilterTypeDto
  name: string
  canManage: boolean
  onActionChange: (action: PiiAction) => void
  onAddException: () => void
  onRemoveException: (rule: PiiRuleDto) => void
  /** Custom types only. */
  onEdit?: () => void
  onDelete?: () => void
}

/**
 * One personal-data type: the action for cloud models (Detect, Mask or Block), and the exceptions
 * for teams and agents under it. A custom type also shows its pattern, with edit and delete.
 */
export default function FilterTypeRow({
  line,
  name,
  canManage,
  onActionChange,
  onAddException,
  onRemoveException,
  onEdit,
  onDelete,
}: Readonly<FilterTypeRowProps>) {
  const t = useTranslations('guard.dataFilters')

  return (
    <li className="border-border flex flex-col gap-3 border-b py-4 first:pt-0 last:border-b-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-label text-foreground">{name}</span>
            {line.source === 'default' && <Tag>{t('standard')}</Tag>}
          </span>
          <span className="text-caption text-muted-foreground">
            {t(`actionHelp.${line.action}`)}
          </span>
          {line.customPattern && (
            <code className="text-code bg-surface-2 w-fit max-w-full truncate rounded px-1.5 py-0.5">
              {line.customPattern}
            </code>
          )}
        </div>
        <div className="flex items-center gap-2">
          <SegmentedControl
            label={t('actionLabel', { type: name })}
            options={PII_ACTIONS.map((value) => ({
              value,
              label: t(`actions.${value}`),
              isDisabled: !canManage,
            }))}
            value={line.action}
            onValueChange={onActionChange}
            size="sm"
          />
          {canManage && onEdit && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('custom.edit', { label: name })}
              onClick={onEdit}
            >
              <Pencil aria-hidden />
            </Button>
          )}
          {canManage && onDelete && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('custom.delete', { label: name })}
              onClick={onDelete}
            >
              <Trash2 aria-hidden />
            </Button>
          )}
        </div>
      </div>
      {(line.exceptions.length > 0 || canManage) && (
        <div className="flex flex-wrap items-center gap-2">
          {line.exceptions.map((rule) => {
            const target = getExceptionTarget(rule)
            return (
              <span
                key={rule.id}
                className="bg-surface-2 text-label text-foreground flex h-7 items-center rounded-md pl-2"
              >
                {t('exceptions.entry', {
                  target: t(`exceptions.${target.kind}`, { name: target.name }),
                  action: t(`actions.${rule.action}`),
                })}
                {canManage && (
                  <button
                    type="button"
                    aria-label={t('exceptions.remove', { target: target.name })}
                    className="text-muted-foreground hover:text-foreground flex size-7 items-center justify-center"
                    onClick={() => {
                      onRemoveException(rule)
                    }}
                  >
                    <X aria-hidden className="size-3.5" />
                  </button>
                )}
              </span>
            )
          })}
          {line.exceptions.length === 0 && (
            <span className="text-caption text-muted-foreground">{t('exceptions.none')}</span>
          )}
          {canManage && (
            <Button
              variant="ghost"
              size="sm"
              icon={Plus}
              aria-label={t('exceptions.addFor', { type: name })}
              onClick={onAddException}
            >
              {t('exceptions.add')}
            </Button>
          )}
        </div>
      )}
    </li>
  )
}
