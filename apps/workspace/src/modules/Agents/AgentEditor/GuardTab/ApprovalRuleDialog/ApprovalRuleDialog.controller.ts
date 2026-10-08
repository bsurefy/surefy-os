// SPDX-License-Identifier: AGPL-3.0-only
'use no memo'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { useForm } from '@surefy/web-core/forms'

import { useApproverDirectory } from '../GuardTab.hooks'
import {
  createApprovalRuleFormSchema,
  emptyApprovalRuleValues,
  toApprovalRule,
  toFormValues,
} from '../GuardTab.schema'
import { newRuleId } from '../GuardTab.utils'

import type { ApprovalRuleDialogProps } from './ApprovalRuleDialog.types'
import type { BaseSyntheticEvent } from 'react'

/** The approval rule form: a new rule, or one being edited. Saving hands the rule back; nothing is sent. */
export function useApprovalRuleDialogController({
  rule,
  action,
  onSave,
}: Pick<ApprovalRuleDialogProps, 'rule' | 'action' | 'onSave'>) {
  const t = useTranslations('agents.editor.guard.ruleDialog')
  const directory = useApproverDirectory()
  const [schema] = useState(() =>
    createApprovalRuleFormSchema({
      action: t('action.required'),
      approvers: t('approvers.required'),
      wait: t('wait.invalid'),
      escalate: t('escalate.required'),
    }),
  )
  const form = useForm({
    schema,
    defaultValues: rule ? toFormValues(rule) : emptyApprovalRuleValues(action),
  })
  const waits = form.watch('waits')
  const onTimeout = form.watch('onTimeout')

  const submit = form.handleSubmit((values) => {
    onSave(toApprovalRule(values, rule?.id ?? newRuleId(), rule ?? undefined))
  })

  return {
    t,
    form,
    approverOptions: directory.options,
    isLoadingApprovers: directory.isLoading,
    waits,
    isEscalating: waits && onTimeout === 'escalate',
    onSubmit: (event: BaseSyntheticEvent) => {
      void submit(event)
    },
  }
}
