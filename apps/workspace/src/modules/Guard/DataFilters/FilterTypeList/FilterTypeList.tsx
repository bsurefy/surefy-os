// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'

import type { DataFilterTypeDto, PiiAction, PiiRuleDto } from '@surefy/contracts'
import { Section } from '@surefy/ui/components/Layout'
import { Button } from '@surefy/ui/primitives/button'

import { getLineKey } from '../DataFilters.utils'
import FilterTypeRow from './FilterTypeRow'

interface FilterTypeListProps {
  builtIn: DataFilterTypeDto[]
  custom: DataFilterTypeDto[]
  canManage: boolean
  typeName: (line: DataFilterTypeDto) => string
  onActionChange: (line: DataFilterTypeDto, action: PiiAction) => void
  onAddException: (line: DataFilterTypeDto) => void
  onRemoveException: (line: DataFilterTypeDto, rule: PiiRuleDto) => void
  onAddCustom: () => void
  onEditCustom: (line: DataFilterTypeDto) => void
  onDeleteCustom: (line: DataFilterTypeDto) => void
}

/** The personal-data types, then the organization's own patterns. */
export default function FilterTypeList({
  builtIn,
  custom,
  canManage,
  typeName,
  onActionChange,
  onAddException,
  onRemoveException,
  onAddCustom,
  onEditCustom,
  onDeleteCustom,
}: Readonly<FilterTypeListProps>) {
  const t = useTranslations('guard.dataFilters')
  return (
    <>
      <Section title={t('section.title')} description={t('section.description')}>
        <ul className="flex flex-col">
          {builtIn.map((line) => (
            <FilterTypeRow
              key={getLineKey(line)}
              line={line}
              name={typeName(line)}
              canManage={canManage}
              onActionChange={(action) => {
                onActionChange(line, action)
              }}
              onAddException={() => {
                onAddException(line)
              }}
              onRemoveException={(rule) => {
                onRemoveException(line, rule)
              }}
            />
          ))}
        </ul>
      </Section>
      <Section
        title={t('custom.title')}
        description={t('custom.description')}
        actions={
          canManage ? (
            <Button variant="secondary" icon={Plus} onClick={onAddCustom}>
              {t('custom.add')}
            </Button>
          ) : undefined
        }
      >
        {custom.length === 0 ? (
          <p className="text-body text-foreground-secondary">{t('custom.none')}</p>
        ) : (
          <ul className="flex flex-col">
            {custom.map((line) => (
              <FilterTypeRow
                key={getLineKey(line)}
                line={line}
                name={typeName(line)}
                canManage={canManage}
                onActionChange={(action) => {
                  onActionChange(line, action)
                }}
                onAddException={() => {
                  onAddException(line)
                }}
                onRemoveException={(rule) => {
                  onRemoveException(line, rule)
                }}
                onEdit={() => {
                  onEditCustom(line)
                }}
                onDelete={() => {
                  onDeleteCustom(line)
                }}
              />
            ))}
          </ul>
        )}
      </Section>
    </>
  )
}
