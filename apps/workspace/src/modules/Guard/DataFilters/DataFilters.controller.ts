// SPDX-License-Identifier: AGPL-3.0-only
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import {
  guardQueries,
  useCreatePiiRuleMutation,
  useDeletePiiRuleMutation,
  useUpdatePiiRuleMutation,
} from '@/api/guard'
import { PERMISSIONS, piiActionLoosened } from '@surefy/contracts'
import type { DataFilterTypeDto, PiiAction, PiiRuleDto, PiiType } from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'
import { useCan, useCurrentOrgId } from '@surefy/web-core/access'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'

import { getExceptionTarget } from './DataFilters.utils'

/** The dialog that is open: one at a time. */
export type DataFiltersDialog =
  | { kind: 'exception'; line: DataFilterTypeDto }
  | { kind: 'custom'; line: DataFilterTypeDto | null }
  | { kind: 'loosen'; line: DataFilterTypeDto; action: PiiAction }
  | { kind: 'deleteCustom'; line: DataFilterTypeDto }
  | { kind: 'removeException'; line: DataFilterTypeDto; rule: PiiRuleDto }

/**
 * Guard › Data filters: the personal-data types and their exceptions. Tightening a type saves at
 * once; loosening one, adding an exception and removing a custom type are T2 with a reason.
 */
export function useDataFiltersController() {
  const t = useTranslations('guard.dataFilters')
  const tErrors = useTranslations('errors')
  const orgId = useCurrentOrgId()
  const canManage = useCan(PERMISSIONS.GUARD_MANAGE)
  const filters = useQuery(guardQueries.dataFilters(orgId))
  const create = useCreatePiiRuleMutation(orgId, { silent: true })
  const update = useUpdatePiiRuleMutation(orgId, { silent: true })
  const remove = useDeletePiiRuleMutation(orgId, { silent: true })
  const [dialog, setDialog] = useState<DataFiltersDialog | null>(null)
  const [dialogError, setDialogError] = useState<string | null>(null)

  const items = filters.data?.items ?? []
  const builtIn = items.filter((line) => line.piiType !== 'custom')
  const custom = items.filter((line) => line.piiType === 'custom')
  const typeName = (entry: { piiType: PiiType; customLabel: string | null }) =>
    entry.piiType === 'custom' ? (entry.customLabel ?? '') : t(`types.${entry.piiType}`)

  const openDialog = (next: DataFiltersDialog | null) => {
    setDialogError(null)
    setDialog(next)
  }

  /** Runs a change and keeps the dialog open with the message when it fails. */
  const run = async (change: () => Promise<unknown>) => {
    try {
      await change()
      setDialog(null)
    } catch (error) {
      if (!isApiError(error)) throw error
      setDialogError(getErrorMessage(error, tErrors))
      throw error
    }
  }

  const applyAction = async (line: DataFilterTypeDto, action: PiiAction, reason?: string) => {
    if (line.ruleId) {
      await update.mutateAsync({ ruleId: line.ruleId, action, ...(reason ? { reason } : {}) })
    } else {
      await create.mutateAsync({
        piiType: line.piiType,
        action,
        scope: 'organization',
        ...(reason ? { reason } : {}),
      })
    }
    toast.success(t('saved', { type: typeName(line), action: t(`actions.${action}`) }))
  }

  return {
    t,
    canManage,
    builtIn,
    custom,
    isLoading: filters.isPending,
    errorMessage: filters.error ? getErrorMessage(filters.error, tErrors) : null,
    errorReference: isApiError(filters.error) ? filters.error.requestId : undefined,
    refetch: () => void filters.refetch(),
    typeName,
    dialog,
    dialogError,
    onCloseDialog: () => {
      setDialog(null)
    },
    openDialog,
    onActionChange: (line: DataFilterTypeDto, action: PiiAction) => {
      if (action === line.action) return
      if (piiActionLoosened(line.action, action)) {
        openDialog({ kind: 'loosen', line, action })
        return
      }
      applyAction(line, action).catch((error: unknown) => {
        toast.error(getErrorMessage(error, tErrors))
      })
    },
    onConfirmLoosen: (reason: string) =>
      run(() => {
        if (dialog?.kind !== 'loosen') return Promise.resolve()
        return applyAction(dialog.line, dialog.action, reason)
      }),
    onAddException: (
      line: DataFilterTypeDto,
      input: { teamId: string; action: PiiAction; reason: string; teamName: string },
    ) =>
      run(async () => {
        await create.mutateAsync({
          piiType: line.piiType,
          ...(line.piiType === 'custom' && line.customLabel && line.customPattern
            ? { customLabel: line.customLabel, customPattern: line.customPattern }
            : {}),
          action: input.action,
          scope: 'team',
          teamId: input.teamId,
          reason: input.reason,
        })
        toast.success(t('exceptionDialog.added', { target: input.teamName }))
      }),
    onSaveCustom: (
      line: DataFilterTypeDto | null,
      input: { label: string; pattern: string; action: PiiAction },
    ) =>
      run(async () => {
        if (line?.ruleId) {
          await update.mutateAsync({
            ruleId: line.ruleId,
            action: input.action,
            customLabel: input.label,
            customPattern: input.pattern,
          })
          toast.success(t('customDialog.updated', { label: input.label }))
          return
        }
        await create.mutateAsync({
          piiType: 'custom',
          customLabel: input.label,
          customPattern: input.pattern,
          action: input.action,
          scope: 'organization',
        })
        toast.success(t('customDialog.added', { label: input.label }))
      }),
    onConfirmDeleteCustom: (reason: string) =>
      run(async () => {
        if (dialog?.kind !== 'deleteCustom' || !dialog.line.ruleId) return
        await remove.mutateAsync({ ruleId: dialog.line.ruleId, reason })
        toast.success(t('removeCustom.deleted', { label: typeName(dialog.line) }))
      }),
    /** Removing an exception that is stricter than the organization loosens the filter. */
    onRemoveException: (line: DataFilterTypeDto, rule: PiiRuleDto) => {
      if (piiActionLoosened(rule.action, line.action)) {
        openDialog({ kind: 'removeException', line, rule })
        return
      }
      remove.mutate(
        { ruleId: rule.id },
        {
          onSuccess: () =>
            toast.success(t('exceptions.removed', { target: getExceptionTarget(rule).name })),
          onError: (error) => toast.error(getErrorMessage(error, tErrors)),
        },
      )
    },
    onConfirmRemoveException: (reason: string) =>
      run(async () => {
        if (dialog?.kind !== 'removeException') return
        await remove.mutateAsync({ ruleId: dialog.rule.id, reason })
        toast.success(t('exceptions.removed', { target: getExceptionTarget(dialog.rule).name }))
      }),
  }
}
