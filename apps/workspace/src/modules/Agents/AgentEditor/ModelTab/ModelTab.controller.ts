// SPDX-License-Identifier: AGPL-3.0-only
import { useInfiniteQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { modelQueries } from '@/api/models'
import { AUTO_MODEL_KEY } from '@surefy/contracts'
import type { UsableModelDto } from '@surefy/contracts'
import { useCurrentOrgId } from '@surefy/web-core/access'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'

import { AGENT_MODEL_TYPE, MODEL_LOOKUP_LIMIT } from '../AgentEditor.constants'

import type { ModelTabProps } from './ModelTab.types'

const PERCENT = 100
/** The Combobox cannot be cleared, so "no double-check model" is an option of its own. */
const NO_DOUBLE_CHECK = 'none'

/** Model: the models the person may use, creativity, the double-check model and the Vault fallback. */
export function useModelTabController({ definition, onDefinitionChange }: ModelTabProps) {
  const t = useTranslations('agents.editor.model')
  const tErrors = useTranslations('errors')
  const orgId = useCurrentOrgId()
  const { model } = definition
  const query = useInfiniteQuery(
    modelQueries.usable(orgId, { type: AGENT_MODEL_TYPE, limit: MODEL_LOOKUP_LIMIT }),
  )
  const models = query.data?.pages.flatMap((page) => page.items) ?? []
  const selected = models.find((candidate) => candidate.modelKey === model.modelKey)

  const describe = (candidate: UsableModelDto) =>
    t('modelDetails', {
      provider: candidate.providerKey,
      cost: t(`cost.${candidate.costTier}`),
      location: t(`location.${candidate.dataLocation}`),
    })
  const options = models.map((candidate) => ({
    value: candidate.modelKey,
    label: candidate.displayName,
    description: describe(candidate),
  }))
  // Auto arrives in V2. While the models load, and for a model that is no longer allowed, the
  // field still names the model the agent has
  const isUnavailable =
    !query.isPending && !query.error && model.modelKey !== AUTO_MODEL_KEY && selected === undefined
  const isNamed = model.modelKey === AUTO_MODEL_KEY || selected !== undefined
  const modelOptions = [
    {
      value: AUTO_MODEL_KEY,
      label: t('auto.label'),
      description: t('auto.soon'),
      isDisabled: true,
    },
    ...(isNamed
      ? []
      : [
          {
            value: model.modelKey,
            label: model.modelKey,
            description: isUnavailable ? t('unavailable.option') : undefined,
            isDisabled: true,
          },
        ]),
    ...options,
  ]

  return {
    t,
    isLoading: query.isPending,
    errorMessage: query.error ? getErrorMessage(query.error, tErrors) : null,
    errorReference: isApiError(query.error) ? query.error.requestId : undefined,
    refetch: () => void query.refetch(),
    isUnavailable,
    modelKey: model.modelKey,
    modelOptions,
    doubleCheckOptions: [{ value: NO_DOUBLE_CHECK, label: t('doubleCheck.none') }, ...options],
    doubleCheckKey: model.doubleCheckModelKey ?? NO_DOUBLE_CHECK,
    selected,
    creativityPercent: Math.round(model.creativity * PERCENT),
    useVaultFallback: model.useVaultFallback,
    onModelChange: (modelKey: string | null) => {
      if (modelKey === null) return
      onDefinitionChange((current) => ({ ...current, model: { ...current.model, modelKey } }))
    },
    onCreativityChange: (percent: number) => {
      onDefinitionChange((current) => ({
        ...current,
        model: { ...current.model, creativity: percent / PERCENT },
      }))
    },
    onDoubleCheckChange: (value: string | null) => {
      onDefinitionChange((current) => ({
        ...current,
        model: {
          ...current.model,
          doubleCheckModelKey: value === null || value === NO_DOUBLE_CHECK ? null : value,
        },
      }))
    },
    onVaultFallbackChange: (useVaultFallback: boolean) => {
      onDefinitionChange((current) => ({
        ...current,
        model: { ...current.model, useVaultFallback },
      }))
    },
  }
}
