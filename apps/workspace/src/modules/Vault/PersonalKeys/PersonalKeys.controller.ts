// SPDX-License-Identifier: AGPL-3.0-only
import { useInfiniteQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { useTestCredentialMutation, vaultQueries } from '@/api/vault'
import { ERROR_CODES } from '@surefy/contracts'
import type { CredentialDto } from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'
import { useCurrentOrgId } from '@surefy/web-core/access'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'

import { KEYS_PAGE_SIZE } from '../Vault.constants'
import { useNow } from '../Vault.hooks'

/**
 * Profile › API keys: the person's own keys. The section only exists when the organization allows
 * personal keys; the API answers `VAULT_PERSONAL_KEYS_DISABLED` otherwise, and the section hides.
 */
export function usePersonalKeysController() {
  const t = useTranslations('vault.personal')
  const tErrors = useTranslations('errors')
  const orgId = useCurrentOrgId()
  const now = useNow()
  const [isAdding, setIsAdding] = useState(false)
  const [revoking, setRevoking] = useState<CredentialDto | null>(null)
  const query = useInfiniteQuery(vaultQueries.myCredentials(orgId, { limit: KEYS_PAGE_SIZE }))
  const test = useTestCredentialMutation(orgId)

  return {
    t,
    orgId,
    now,
    keys: query.data?.pages.flatMap((page) => page.items) ?? [],
    isLoading: query.isPending,
    isDisabledByPolicy:
      isApiError(query.error) && query.error.code === ERROR_CODES.VAULT_PERSONAL_KEYS_DISABLED,
    errorMessage: query.error ? getErrorMessage(query.error, tErrors) : null,
    errorReference: isApiError(query.error) ? query.error.requestId : undefined,
    refetch: () => void query.refetch(),
    hasMore: query.hasNextPage,
    isLoadingMore: query.isFetchingNextPage,
    onLoadMore: () => void query.fetchNextPage(),
    onTest: (key: CredentialDto) => {
      test.mutate(key.id, {
        onSuccess: (result) => {
          if (result.ok) toast.success(t('testPassed', { name: key.name }))
          else {
            toast.error(t('testFailed', { name: key.name }), {
              description: tErrors(result.reasonCode ?? 'VAULT_KEY_INVALID'),
            })
          }
        },
      })
    },
    testingId: test.isPending ? test.variables : undefined,
    isAdding,
    onAdd: () => {
      setIsAdding(true)
    },
    onCloseAdd: () => {
      setIsAdding(false)
    },
    revoking,
    onRevoke: setRevoking,
    onCloseRevoke: () => {
      setRevoking(null)
    },
  }
}
