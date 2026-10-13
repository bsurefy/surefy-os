// SPDX-License-Identifier: AGPL-3.0-only
'use no memo'

import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { useWatch } from 'react-hook-form'

import {
  guardQueries,
  useCreateGuardrailMutation,
  useDeleteGuardrailMutation,
  useLockGuardrailMutation,
  useUnlockGuardrailMutation,
  useUpdateGuardrailMutation,
} from '@/api/guard'
import { ERROR_CODES } from '@surefy/contracts'
import type { GuardrailDto, GuardrailType } from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'
import { useCurrentOrgId } from '@surefy/web-core/access'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'
import { useForm } from '@surefy/web-core/forms'

import { isGuardrailLoosened } from '../Guardrails.utils'
import { useGuardCurrency } from './GuardrailSheet.hooks'
import { createGuardrailFormSchema } from './GuardrailSheet.schema'
import {
  emptyGuardrailValues,
  toCreateInput,
  toGuardrailDefinition,
  toGuardrailValues,
} from './GuardrailSheet.utils'

import type { GuardrailFormOutput } from './GuardrailSheet.schema'
import type { BaseSyntheticEvent } from 'react'

type Pending =
  { kind: 'loosen'; values: GuardrailFormOutput } | { kind: 'delete' } | { kind: 'lock' }

interface Params {
  /** The guardrail being edited; null when adding one. */
  guardrail: GuardrailDto | null
  initialType: GuardrailType
  canManage: boolean
  canLock: boolean
  onOpenRule: (id: string) => void
  onClose: () => void
}

/**
 * The guardrail sheet's form. Adding and tightening save at once; turning off, loosening and
 * deleting are T2 with the impact and a reason. A locked rule is read-only unless the person is an
 * Owner, who can also lock and unlock it.
 */
export function useGuardrailFormController({
  guardrail,
  initialType,
  canManage,
  canLock,
  onOpenRule,
  onClose,
}: Params) {
  const t = useTranslations('guard.guardrails.sheet')
  const tErrors = useTranslations('errors')
  const orgId = useCurrentOrgId()
  const currency = useGuardCurrency()
  const create = useCreateGuardrailMutation(orgId, { silent: true })
  const update = useUpdateGuardrailMutation(orgId, { silent: true })
  const remove = useDeleteGuardrailMutation(orgId, { silent: true })
  const lock = useLockGuardrailMutation(orgId, { silent: true })
  const unlock = useUnlockGuardrailMutation(orgId, { silent: true })
  const [pending, setPending] = useState<Pending | null>(null)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [saveFailed, setSaveFailed] = useState(false)

  const isNew = guardrail === null
  const canEdit = canManage && (!guardrail?.isLocked || canLock)
  const form = useForm({
    schema: createGuardrailFormSchema({
      name: t('validation.name'),
      action: t('validation.action'),
      team: t('validation.team'),
      condition: t('validation.condition'),
      approvers: t('validation.approvers'),
      wait: t('validation.wait'),
      escalate: t('validation.escalate'),
      thresholds: t('validation.thresholds'),
      limit: t('validation.limit'),
      categories: t('validation.categories'),
    }),
    defaultValues: guardrail ? toGuardrailValues(guardrail) : emptyGuardrailValues(initialType),
  })
  const values = useWatch({ control: form.control })

  const showError = (error: unknown) => {
    const message = getErrorMessage(error, tErrors)
    if (isApiError(error) && error.code === ERROR_CODES.GUARD_RULE_NAME_TAKEN) {
      form.setError('name', { message })
    } else {
      form.setError('root', { message })
    }
  }

  const saveChanges = async (output: GuardrailFormOutput, reason?: string) => {
    if (!guardrail) return
    const saved = await update.mutateAsync({
      guardrailId: guardrail.id,
      name: output.name,
      isEnabled: output.isEnabled,
      definition: toGuardrailDefinition(output),
      ...(reason ? { reason } : {}),
    })
    toast.success(t('saved', { name: saved.name }))
    form.reset(toGuardrailValues(saved))
    setSaveFailed(false)
  }

  const submit = form.handleSubmit(async (output) => {
    form.clearErrors('root')
    try {
      if (!guardrail) {
        const created = await create.mutateAsync(toCreateInput(output))
        toast.success(t('added', { name: created.name }))
        // a conflict is shown on the rule's own sheet
        if (created.conflictsWith) onOpenRule(created.id)
        else onClose()
        return
      }
      const next = { isEnabled: output.isEnabled, definition: toGuardrailDefinition(output) }
      if (isGuardrailLoosened(guardrail, next)) {
        setDialogError(null)
        setPending({ kind: 'loosen', values: output })
        return
      }
      await saveChanges(output)
    } catch (error) {
      if (!isApiError(error)) throw error
      setSaveFailed(true)
      showError(error)
    }
  })

  const runPending = async (action: () => Promise<unknown>) => {
    try {
      await action()
      setPending(null)
    } catch (error) {
      setDialogError(getErrorMessage(error, tErrors))
      throw error
    }
  }

  return {
    t,
    form,
    values,
    currency,
    isNew,
    canEdit,
    canLock,
    isSaving: create.isPending || update.isPending,
    saveFailed,
    formError: form.formState.errors.root?.message,
    onSubmit: (event: BaseSyntheticEvent) => {
      void submit(event)
    },
    pending,
    dialogError,
    onClosePending: () => {
      setPending(null)
    },
    onDelete: () => {
      setDialogError(null)
      setPending({ kind: 'delete' })
    },
    onLock: () => {
      setDialogError(null)
      setPending({ kind: 'lock' })
    },
    onUnlock: () => {
      if (!guardrail) return
      unlock.mutate(guardrail.id, {
        onSuccess: (saved) => {
          toast.success(t('lock.unlocked', { name: saved.name }))
        },
        onError: (error) => toast.error(getErrorMessage(error, tErrors)),
      })
    },
    isUnlocking: unlock.isPending,
    onConfirmLoosen: (reason: string) =>
      runPending(() =>
        pending?.kind === 'loosen' ? saveChanges(pending.values, reason) : Promise.resolve(),
      ),
    onConfirmDelete: (reason: string) =>
      runPending(async () => {
        if (!guardrail) return
        await remove.mutateAsync({ guardrailId: guardrail.id, reason })
        toast.success(t('deleted', { name: guardrail.name }))
        onClose()
      }),
    onConfirmLock: (reason: string) =>
      runPending(async () => {
        if (!guardrail) return
        const saved = await lock.mutateAsync({ guardrailId: guardrail.id, reason })
        toast.success(t('lock.locked', { name: saved.name }))
      }),
  }
}

/** Loads one guardrail for the sheet. */
export function useGuardrailLoad(guardrailId: string, isEnabled: boolean) {
  const orgId = useCurrentOrgId()
  const tErrors = useTranslations('errors')
  const query = useQuery({ ...guardQueries.guardrail(orgId, guardrailId), enabled: isEnabled })
  return {
    guardrail: query.data,
    isLoading: isEnabled && query.isPending,
    isNotFound: isApiError(query.error) && query.error.code === ERROR_CODES.GUARD_RULE_NOT_FOUND,
    errorMessage: query.error ? getErrorMessage(query.error, tErrors) : null,
    errorReference: isApiError(query.error) ? query.error.requestId : undefined,
    refetch: () => void query.refetch(),
  }
}
