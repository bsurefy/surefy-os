// SPDX-License-Identifier: AGPL-3.0-only
'use no memo'

import { useInfiniteQuery } from '@tanstack/react-query'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'

import { memberQueries } from '@/api/members'
import { teamQueries } from '@/api/teams'
import { budgetQueries, useCreateBudgetMutation, useUpdateBudgetMutation } from '@/api/usage'
import { BUDGET_ON_REACHED_ACTIONS } from '@surefy/contracts'
import type { BudgetDto, BudgetScope } from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'
import { useForm } from '@surefy/web-core/forms'

import { BUDGET_ALERT_CHOICES_BP, PICKER_PAGE_SIZE } from '../UsageBudgetsSettings.constants'
import { useFormatMoney } from '../UsageBudgetsSettings.hooks'
import { budgetFormSchema } from '../UsageBudgetsSettings.schema'
import {
  getBudgetErrorField,
  getCurrencySymbol,
  getLoweredBelowSpend,
  getParentAmountMicros,
  getTeamsWithoutBudget,
  toBudgetFormValues,
  toCreateBudgetInput,
  toUpdateBudgetInput,
  unitsToMicros,
} from '../UsageBudgetsSettings.utils'

import type { BudgetFormOutput } from '../UsageBudgetsSettings.schema'
import type { BaseSyntheticEvent } from 'react'

const DEFAULT_CURRENCY = 'USD'

/**
 * Create or change a budget. A team budget or personal limit may not exceed the enabled
 * organization budget; lowering an enabled budget to this month's spend or below is T2, naming
 * the spend and what happens next.
 */
export function useBudgetFormController({
  orgId,
  scope,
  budget,
  organizationBudget,
  currency,
  onClose,
}: {
  orgId: string
  scope: BudgetScope
  /** The budget being changed; null to create one. */
  budget: BudgetDto | null
  organizationBudget: BudgetDto | null
  currency: string | null
  onClose: () => void
}) {
  const t = useTranslations('settings.usage')
  const tErrors = useTranslations('errors')
  const locale = useLocale()
  const formatMoney = useFormatMoney()
  const needsTarget = budget === null && scope !== 'organization'
  const form = useForm({
    schema: budgetFormSchema({ needsTarget }),
    defaultValues: toBudgetFormValues(budget),
  })
  const create = useCreateBudgetMutation(orgId, { silent: true })
  const update = useUpdateBudgetMutation(orgId, { silent: true })
  const [pending, setPending] = useState<{ values: BudgetFormOutput; spentMicros: number } | null>(
    null,
  )
  const [personQuery, setPersonQuery] = useState('')

  const pickTeam = needsTarget && scope === 'team'
  const pickPerson = needsTarget && scope === 'user'
  const teams = useInfiniteQuery({
    ...teamQueries.list(orgId, { sort: 'name', limit: PICKER_PAGE_SIZE }),
    enabled: pickTeam,
  })
  const teamBudgets = useInfiniteQuery({
    ...budgetQueries.list(orgId, { scope: 'team', limit: PICKER_PAGE_SIZE }),
    enabled: pickTeam,
  })
  const people = useInfiniteQuery({
    ...memberQueries.list(orgId, {
      status: 'active',
      q: personQuery || undefined,
      limit: PICKER_PAGE_SIZE,
    }),
    enabled: pickPerson,
  })

  const code = budget?.currency ?? currency ?? DEFAULT_CURRENCY
  const parentMicros = getParentAmountMicros(scope, organizationBudget)
  const targetName = budget?.team?.name ?? budget?.user?.name ?? null
  // messages pick their own wording for the organization (`{scope, select, …}`)
  const name = targetName ?? t('formerTarget')

  const save = async (values: BudgetFormOutput) => {
    try {
      if (budget) {
        const input = toUpdateBudgetInput(budget, values)
        if (input) {
          await update.mutateAsync({ budgetId: budget.id, ...input })
          toast.success(t('form.saved'))
        }
      } else {
        await create.mutateAsync(toCreateBudgetInput(scope, values))
        toast.success(t('form.created'))
      }
      onClose()
    } catch (error) {
      setPending(null)
      if (!isApiError(error)) throw error
      const field = getBudgetErrorField(error.code, needsTarget)
      if (field === 'amount') {
        // the cap moved since the page loaded: name the one this page knows, if any
        form.setError('amount', {
          message:
            parentMicros === null
              ? t('form.aboveOrganizationUnknown')
              : t('form.aboveOrganization', { amount: formatMoney(parentMicros, code) }),
        })
        return
      }
      form.setError(field, { message: getErrorMessage(error, tErrors) })
    }
  }

  const submit = form.handleSubmit(async (values) => {
    if (parentMicros !== null && unitsToMicros(values.amount) > parentMicros) {
      form.setError('amount', {
        message: t('form.aboveOrganization', { amount: formatMoney(parentMicros, code) }),
      })
      return
    }
    const spentMicros = getLoweredBelowSpend(budget, values)
    if (spentMicros !== null) {
      setPending({ values, spentMicros })
      return
    }
    await save(values)
  })

  const availableTeams = getTeamsWithoutBudget(
    teams.data?.pages.flatMap((page) => page.items) ?? [],
    teamBudgets.data?.pages.flatMap((page) => page.items) ?? [],
  )

  return {
    form,
    isCreate: budget === null,
    title: budget ? t(`form.editTitle.${scope}`, { name }) : t(`form.createTitle.${scope}`),
    pickTeam,
    pickPerson,
    teamOptions: availableTeams.map((team) => ({ value: team.id, label: team.name })),
    isLoadingTeams: teams.isPending || teamBudgets.isPending,
    personOptions: (people.data?.pages.flatMap((page) => page.items) ?? []).map((member) => ({
      value: member.user.id,
      label: member.user.name,
      description: member.user.email,
    })),
    isLoadingPeople: people.isFetching,
    onPersonSearch: setPersonQuery,
    currencySymbol: getCurrencySymbol(code, locale),
    parentHint:
      parentMicros === null
        ? null
        : t('form.organizationCap', { amount: formatMoney(parentMicros, code) }),
    onReachedOptions: BUDGET_ON_REACHED_ACTIONS.map((action) => ({
      value: action,
      label: t(`onReached.${action}.label`),
      description: t(`onReached.${action}.description`),
    })),
    alertChoices: BUDGET_ALERT_CHOICES_BP,
    formError: form.formState.errors.root?.message,
    isSaving: form.formState.isSubmitting || create.isPending || update.isPending,
    onSubmit: (event: BaseSyntheticEvent) => {
      void submit(event)
    },
    confirm: pending && {
      title: t('lower.title', { scope, name }),
      description: t(`lower.${pending.values.onReached}`, {
        scope,
        name,
        spent: formatMoney(pending.spentMicros, code),
      }),
      onCancel: () => {
        setPending(null)
      },
      onConfirm: () => save(pending.values),
    },
    t,
  }
}
