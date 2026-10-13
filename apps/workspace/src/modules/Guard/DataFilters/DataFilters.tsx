// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Shield } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { IconTile } from '@surefy/ui/components/DataDisplay'
import { Banner, ErrorState, SkeletonCard } from '@surefy/ui/components/Feedback'
import { PageHeader } from '@surefy/ui/components/Layout'

import GuardReasonDialog from '../GuardReasonDialog'
import CustomTypeDialog from './CustomTypeDialog'
import { useDataFiltersController } from './DataFilters.controller'
import { getExceptionTarget } from './DataFilters.utils'
import ExceptionDialog from './ExceptionDialog'
import FilterTypeList from './FilterTypeList'
import TryIt from './TryIt'
import GuardTabs from '../GuardTabs'

/**
 * Guard › Data filters (design/workspace/guard.md): for each personal-data type, whether it is
 * detected, masked or blocked before it leaves for a cloud model; exceptions per team; the
 * organization's own patterns; and a live "Try it" box. Local models skip the filter by policy.
 */
export default function DataFilters() {
  const c = useDataFiltersController()
  const { t, dialog } = c
  const tLoosen = useTranslations('guard.dataFilters.loosen')
  const tActions = useTranslations('guard.dataFilters.actions')

  const reasonLabels = (confirm: string) => ({
    confirm,
    reason: tLoosen('reason'),
    reasonHelp: tLoosen('reasonHelp'),
    reasonRequired: tLoosen('reasonRequired'),
  })

  let body
  if (c.errorMessage) {
    body = (
      <ErrorState
        title={t('loadError')}
        message={c.errorMessage}
        reference={c.errorReference}
        onRetry={c.refetch}
      />
    )
  } else if (c.isLoading) {
    body = (
      <div aria-busy className="flex flex-col gap-6">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    )
  } else {
    body = (
      <>
        <FilterTypeList
          builtIn={c.builtIn}
          custom={c.custom}
          canManage={c.canManage}
          typeName={c.typeName}
          onActionChange={c.onActionChange}
          onAddException={(line) => {
            c.openDialog({ kind: 'exception', line })
          }}
          onRemoveException={c.onRemoveException}
          onAddCustom={() => {
            c.openDialog({ kind: 'custom', line: null })
          }}
          onEditCustom={(line) => {
            c.openDialog({ kind: 'custom', line })
          }}
          onDeleteCustom={(line) => {
            c.openDialog({ kind: 'deleteCustom', line })
          }}
        />
        <TryIt
          version={[...c.builtIn, ...c.custom]
            .map((line) => `${line.piiType}:${line.action}:${line.exceptions.length}`)
            .join()}
          typeName={c.typeName}
        />
      </>
    )
  }

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        icon={<IconTile icon={Shield} />}
        tabs={<GuardTabs active="data-filters" />}
      />
      {!c.canManage && (
        <Banner tone="info" title={t('readOnly.title')} description={t('readOnly.description')} />
      )}
      <Banner
        tone="info"
        title={t('localModels.title')}
        description={t('localModels.description')}
      />
      {body}
      {dialog?.kind === 'exception' && (
        <ExceptionDialog
          typeName={c.typeName(dialog.line)}
          currentAction={dialog.line.action}
          onAdd={(input) => c.onAddException(dialog.line, input)}
          onClose={c.onCloseDialog}
        />
      )}
      {dialog?.kind === 'custom' && (
        <CustomTypeDialog
          line={dialog.line}
          onSave={(input) => c.onSaveCustom(dialog.line, input)}
          onClose={c.onCloseDialog}
        />
      )}
      {dialog?.kind === 'loosen' && (
        <GuardReasonDialog
          open
          onOpenChange={(open) => {
            if (!open) c.onCloseDialog()
          }}
          title={tLoosen('title', { type: c.typeName(dialog.line) })}
          description={tLoosen('description')}
          impact={[
            tLoosen('change', {
              type: c.typeName(dialog.line),
              from: tActions(dialog.line.action),
              to: tActions(dialog.action),
            }),
          ]}
          isReasonRequired
          labels={reasonLabels(tLoosen('confirm'))}
          error={c.dialogError}
          onConfirm={({ reason }) => c.onConfirmLoosen(reason ?? '')}
        />
      )}
      {dialog?.kind === 'deleteCustom' && (
        <GuardReasonDialog
          open
          onOpenChange={(open) => {
            if (!open) c.onCloseDialog()
          }}
          title={t('removeCustom.title', { label: c.typeName(dialog.line) })}
          description={t('removeCustom.description')}
          isReasonRequired
          tone="destructive"
          labels={reasonLabels(t('removeCustom.confirm'))}
          error={c.dialogError}
          onConfirm={({ reason }) => c.onConfirmDeleteCustom(reason ?? '')}
        />
      )}
      {dialog?.kind === 'removeException' && (
        <GuardReasonDialog
          open
          onOpenChange={(open) => {
            if (!open) c.onCloseDialog()
          }}
          title={t('removeException.title', { target: getExceptionTarget(dialog.rule).name })}
          description={t('removeException.description', { type: c.typeName(dialog.line) })}
          isReasonRequired
          tone="destructive"
          labels={reasonLabels(t('removeException.confirm'))}
          error={c.dialogError}
          onConfirm={({ reason }) => c.onConfirmRemoveException(reason ?? '')}
        />
      )}
    </div>
  )
}
