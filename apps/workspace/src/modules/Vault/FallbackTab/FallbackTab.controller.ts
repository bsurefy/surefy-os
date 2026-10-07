// SPDX-License-Identifier: AGPL-3.0-only
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { modelQueries, useUpdateVaultSettingsMutation } from '@/api/models'
import { FALLBACK_ORDER_MAX } from '@surefy/contracts'
import type { FallbackEntryDto, VaultFallback } from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'
import { useCurrentOrgId } from '@surefy/web-core/access'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'

import { KEYS_PAGE_SIZE } from '../Vault.constants'
import { getFallbackChain, moveItem } from '../Vault.utils'

export const DEFAULT_TIMEOUT_SECONDS = 30

/**
 * Vault › Fallback: the ordered list, when to fall back, and the live "requests go to…" preview.
 * Edits stay in a draft until Save; the preview follows the draft with the states the server last
 * reported (a model added in the draft shows as ready once its state is known).
 */
export function useFallbackTabController() {
  const t = useTranslations('vault.fallback')
  const tErrors = useTranslations('errors')
  const orgId = useCurrentOrgId()
  const [draft, setDraft] = useState<VaultFallback | null>(null)

  const settings = useQuery(modelQueries.settings(orgId))
  const chatModels = useInfiniteQuery(
    modelQueries.list(orgId, { type: 'chat', isEnabled: true, limit: KEYS_PAGE_SIZE }),
  )
  const update = useUpdateVaultSettingsMutation(orgId, { silent: true })

  const saved = settings.data?.fallback
  const fallback = draft ?? saved
  const models = chatModels.data?.pages.flatMap((page) => page.items) ?? []

  const entries: FallbackEntryDto[] = (fallback?.order ?? []).map((modelKey) => {
    const known = settings.data?.fallbackEntries.find((entry) => entry.modelKey === modelKey)
    if (known) return known
    const model = models.find((candidate) => candidate.modelKey === modelKey)
    return {
      modelKey,
      displayName: model?.displayName ?? null,
      state: model ? 'ready' : 'missing',
    }
  })

  const edit = (patch: Partial<VaultFallback>) => {
    if (fallback) setDraft({ ...fallback, ...patch })
  }

  const inOrder = new Set(fallback?.order)
  return {
    t,
    isLoading: settings.isPending,
    errorMessage: settings.error ? getErrorMessage(settings.error, tErrors) : null,
    errorReference: isApiError(settings.error) ? settings.error.requestId : undefined,
    refetch: () => void settings.refetch(),
    fallback,
    entries,
    chain: getFallbackChain(entries),
    addOptions: models
      .filter((model) => !inOrder.has(model.modelKey))
      .map((model) => ({
        value: model.modelKey,
        label: model.displayName,
        description: model.server ? model.server.name : model.providerKey,
      })),
    isFull: (fallback?.order.length ?? 0) >= FALLBACK_ORDER_MAX,
    onAdd: (modelKey: string) => {
      if (fallback) edit({ order: [...fallback.order, modelKey] })
    },
    onRemove: (modelKey: string) => {
      if (fallback) edit({ order: fallback.order.filter((key) => key !== modelKey) })
    },
    onMove: (from: number, to: number) => {
      if (fallback) edit({ order: moveItem(fallback.order, from, to) })
    },
    onProviderErrorChange: (onProviderError: boolean) => {
      edit({ onProviderError })
    },
    onTimeoutEnabledChange: (isEnabled: boolean) => {
      edit({ timeoutSeconds: isEnabled ? DEFAULT_TIMEOUT_SECONDS : null })
    },
    onTimeoutChange: (seconds: number | null) => {
      edit({ timeoutSeconds: seconds })
    },
    isDirty: draft !== null,
    isSaving: update.isPending,
    saveError: update.error ? getErrorMessage(update.error, tErrors) : undefined,
    onDiscard: () => {
      setDraft(null)
      update.reset()
    },
    onSave: () => {
      if (!draft) return
      update.mutate(
        { fallback: draft },
        {
          onSuccess: () => {
            setDraft(null)
            toast.success(t('saved'))
          },
        },
      )
    },
  }
}
