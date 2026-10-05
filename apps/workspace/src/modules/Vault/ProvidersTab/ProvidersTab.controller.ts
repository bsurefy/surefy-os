// SPDX-License-Identifier: AGPL-3.0-only
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { debounce, useQueryStates } from 'nuqs'
import { useState } from 'react'

import { useTestCredentialMutation, vaultQueries } from '@/api/vault'
import type { CredentialDto } from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'
import { useCurrentOrgId } from '@surefy/web-core/access'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'

import { KEYS_PAGE_SIZE } from '../Vault.constants'
import { useNow } from '../Vault.hooks'
import { KEY_DIALOG } from './ProvidersTab.constants'
import { providersSearchParams } from './ProvidersTab.searchParams'

import type { KeyDialogKind } from './ProvidersTab.constants'

const SEARCH_DEBOUNCE_MS = 300

export interface OpenKeyDialog {
  kind: KeyDialogKind
  credential?: CredentialDto
}

/** Vault › Providers & keys: the provider cards, the keys table and its dialogs. */
export function useProvidersTabController() {
  const t = useTranslations('vault.providers')
  const tErrors = useTranslations('errors')
  const orgId = useCurrentOrgId()
  const now = useNow()
  const [filters, setFilters] = useQueryStates(providersSearchParams)
  const [dialog, setDialog] = useState<OpenKeyDialog | null>(null)

  const providers = useQuery(vaultQueries.providers(orgId))
  const keys = useInfiniteQuery(
    vaultQueries.credentials(orgId, {
      kind: 'ai_provider',
      q: filters.q || undefined,
      scope: filters.scope ?? undefined,
      limit: KEYS_PAGE_SIZE,
    }),
  )
  const test = useTestCredentialMutation(orgId)

  const credentials = keys.data?.pages.flatMap((page) => page.items) ?? []
  const hasFilters = filters.q !== '' || filters.scope !== null
  const cards = providers.data ?? []
  const isEmpty =
    !keys.isPending &&
    credentials.length === 0 &&
    !hasFilters &&
    cards.every((card) => card.keyCount === 0)

  const onTest = (credential: CredentialDto) => {
    test.mutate(credential.id, {
      onSuccess: (result) => {
        if (result.ok) {
          toast.success(t('testPassed', { name: credential.name, count: result.models.length }))
        } else {
          toast.error(t('testFailed', { name: credential.name }), {
            description: tErrors(result.reasonCode ?? 'VAULT_KEY_INVALID'),
          })
        }
      },
    })
  }

  return {
    t,
    orgId,
    now,
    filters,
    cards,
    credentials,
    isLoadingCards: providers.isPending,
    isLoading: keys.isPending,
    isEmpty,
    hasFilters,
    errorMessage: keys.error ? getErrorMessage(keys.error, tErrors) : null,
    errorReference: isApiError(keys.error) ? keys.error.requestId : undefined,
    cardsErrorMessage: providers.error ? getErrorMessage(providers.error, tErrors) : null,
    refetch: () => {
      void keys.refetch()
      void providers.refetch()
    },
    hasMore: keys.hasNextPage,
    isLoadingMore: keys.isFetchingNextPage,
    onLoadMore: () => void keys.fetchNextPage(),
    onSearchChange: (value: string) =>
      void setFilters(
        { q: value || null },
        { limitUrlUpdates: debounce(SEARCH_DEBOUNCE_MS), history: 'replace' },
      ),
    onScopeChange: (scope: (typeof filters)['scope']) => void setFilters({ scope }),
    onClearFilters: () => void setFilters({ q: null, scope: null }),
    onTest,
    isTesting: test.isPending ? test.variables : undefined,
    dialog: filters.add === 'key' && !dialog ? { kind: KEY_DIALOG.ADD } : dialog,
    openDialog: setDialog,
    closeDialog: () => {
      setDialog(null)
      if (filters.add) void setFilters({ add: null })
    },
  }
}
