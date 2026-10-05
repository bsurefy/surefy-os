// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Check } from 'lucide-react'
import { useTranslations } from 'next-intl'

import type { ModelAccessEntryDto, TeamDto } from '@surefy/contracts'
import { DataTable } from '@surefy/ui/components/DataDisplay'
import type { DataTableColumn } from '@surefy/ui/components/DataDisplay'
import { Button } from '@surefy/ui/primitives/button'

import { ACCESS_SUBJECT } from '../../Vault.constants'
import { toAccessValues } from '../../Vault.utils'

import type { ReactNode } from 'react'

export interface AccessMatrixProps {
  entries: ModelAccessEntryDto[]
  teams: Pick<TeamDto, 'id' | 'name'>[]
  isLoading: boolean
  emptyState: ReactNode
  onChange: (entry: ModelAccessEntryDto, values: string[]) => void
}

/** Models down, "Everyone" and teams across; each cell toggles one grant. For small organizations. */
export default function AccessMatrix({
  entries,
  teams,
  isLoading,
  emptyState,
  onChange,
}: Readonly<AccessMatrixProps>) {
  const t = useTranslations('vault.modelAccess.matrix')

  const cell = (
    entry: ModelAccessEntryDto,
    value: string,
    subject: string,
    isViaEveryone = false,
  ) => {
    const values = toAccessValues(entry.rules)
    const isGranted = values.includes(value)
    const isInherited = isViaEveryone && !isGranted
    return (
      <Button
        type="button"
        variant={isGranted ? 'secondary' : 'ghost'}
        size="icon-sm"
        aria-pressed={isGranted || isInherited}
        disabled={isInherited}
        aria-label={
          isInherited
            ? t('viaEveryone', { subject, model: entry.displayName })
            : t('toggle', { subject, model: entry.displayName })
        }
        onClick={() => {
          onChange(entry, isGranted ? values.filter((v) => v !== value) : [...values, value])
        }}
      >
        {isGranted || isInherited ? <Check aria-hidden /> : <span aria-hidden>·</span>}
      </Button>
    )
  }

  const hasEveryone = (entry: ModelAccessEntryDto) =>
    toAccessValues(entry.rules).includes(ACCESS_SUBJECT.ORGANIZATION)

  const columns: DataTableColumn<ModelAccessEntryDto>[] = [
    {
      id: 'model',
      header: t('model'),
      isHideable: false,
      cell: (entry) => <span className="text-body font-medium">{entry.displayName}</span>,
    },
    {
      id: 'everyone',
      header: t('everyone'),
      align: 'end',
      cell: (entry) => cell(entry, ACCESS_SUBJECT.ORGANIZATION, t('everyone')),
    },
    ...teams.map((team): DataTableColumn<ModelAccessEntryDto> => ({
      id: `team-${team.id}`,
      header: team.name,
      align: 'end',
      cell: (entry) =>
        cell(entry, `${ACCESS_SUBJECT.TEAM_PREFIX}${team.id}`, team.name, hasEveryone(entry)),
    })),
  ]

  return (
    <DataTable
      columns={columns}
      data={entries}
      getRowId={(entry) => entry.modelId}
      labels={{ caption: t('tableLabel') }}
      isLoading={isLoading}
      emptyState={emptyState}
    />
  )
}
