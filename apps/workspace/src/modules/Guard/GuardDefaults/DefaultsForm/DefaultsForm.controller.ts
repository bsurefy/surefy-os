// SPDX-License-Identifier: AGPL-3.0-only
'use no memo'

import { useFormatter, useTranslations } from 'next-intl'
import { useState } from 'react'
import { useWatch } from 'react-hook-form'

import { useUpdateGuardDefaultsMutation } from '@/api/guard'
import type { GuardSettingsDto, UpdateGuardSettingsInput } from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'
import { useCurrentOrgId } from '@surefy/web-core/access'
import { getErrorMessage } from '@surefy/web-core/errors'
import { useForm } from '@surefy/web-core/forms'

import { createGuardDefaultsSchema } from '../GuardDefaults.schema'
import {
  countChangedSettings,
  getLoosenedChanges,
  toGuardDefaultsValues,
  toGuardSettingsInput,
} from '../GuardDefaults.utils'

import type { GuardDefaultsOutput } from '../GuardDefaults.schema'
import type { LoosenedChange } from '../GuardDefaults.utils'
import type { BaseSyntheticEvent } from 'react'

/**
 * The defaults form with the sticky save bar. Saving is T2 ("Applies to all agents and flows that
 * use defaults"): the confirmation names what gets looser and asks for a reason only then. A
 * failed save keeps the changes and the bar offers Retry.
 */
export function useDefaultsFormController({ settings }: { settings: GuardSettingsDto }) {
  const t = useTranslations('guard.defaults')
  const tErrors = useTranslations('errors')
  const format = useFormatter()
  const orgId = useCurrentOrgId()
  const mutation = useUpdateGuardDefaultsMutation(orgId, { silent: true })
  const [pending, setPending] = useState<UpdateGuardSettingsInput | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const saved = toGuardDefaultsValues(settings)
  const form = useForm({
    schema: createGuardDefaultsSchema({
      thresholds: t('thresholds.invalid'),
      stepUp: t('approvals.stepUp.required'),
      target: t('approvals.target.invalid'),
    }),
    defaultValues: saved,
  })
  const values = useWatch({ control: form.control })
  const changeCount = countChangedSettings(saved, { ...saved, ...values })

  const money = (units: number) =>
    format.number(units, { style: 'currency', currency: settings.currency })
  const describe = (change: LoosenedChange): string => {
    switch (change.kind) {
      case 'auto':
      case 'review':
        return t(`loosened.${change.kind}`, { from: change.from, to: change.to })
      case 'quickAmount':
        return t('loosened.quickAmount', { from: money(change.from), to: money(change.to) })
      case 'quickRisk':
        return t('loosened.quickRisk')
      case 'stepUp':
        return change.to === null
          ? t('loosened.stepUp', { from: money(change.from) })
          : t('loosened.stepUpRaised', { from: money(change.from), to: money(change.to) })
    }
  }
  const loosened = pending ? getLoosenedChanges(settings, pending) : []

  const submit = form.handleSubmit((output: GuardDefaultsOutput) => {
    setSaveError(null)
    setPending(toGuardSettingsInput(output))
  })

  return {
    t,
    form,
    values,
    changeCount,
    isDirty: changeCount > 0,
    isSaving: mutation.isPending,
    saveError,
    onSubmit: (event: BaseSyntheticEvent) => {
      void submit(event)
    },
    onDiscard: () => {
      form.reset(saved)
      setSaveError(null)
    },
    confirm: {
      open: pending !== null,
      onOpenChange: (open: boolean) => {
        if (!open) setPending(null)
      },
      isReasonRequired: loosened.length > 0,
      impact: loosened.map(describe),
      error: saveError,
      onConfirm: async ({ reason }: { reason: string | undefined }) => {
        if (!pending) return
        try {
          const updated = await mutation.mutateAsync({ ...pending, ...(reason ? { reason } : {}) })
          toast.success(t('save.saved'))
          form.reset(toGuardDefaultsValues(updated))
          setSaveError(null)
          setPending(null)
        } catch (error) {
          setSaveError(getErrorMessage(error, tErrors))
          throw error
        }
      },
    },
  }
}
