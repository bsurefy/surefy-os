// SPDX-License-Identifier: AGPL-3.0-only
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { useTestCredentialMutation, vaultQueries } from '@/api/vault'
import type { CredentialDto } from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'
import { useCurrentOrgId } from '@surefy/web-core/access'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'

import { SEARCH_DIALOG } from './SearchProviders.constants'
import { useNow } from '../../Vault.hooks'

import type { SearchDialogKind } from './SearchProviders.constants'

export interface OpenSearchDialog {
  kind: SearchDialogKind
  credential?: CredentialDto
}

/** Vault › Providers & keys › Search providers: the stored providers and the one a search uses. */
export function useSearchProvidersController() {
  const t = useTranslations('vault.searchProviders')
  const tErrors = useTranslations('errors')
  const orgId = useCurrentOrgId()
  const now = useNow()
  const [dialog, setDialog] = useState<OpenSearchDialog | null>(null)
  const settings = useQuery(vaultQueries.searchProviders(orgId))
  const test = useTestCredentialMutation(orgId)

  const onTest = (credential: CredentialDto) => {
    test.mutate(credential.id, {
      onSuccess: (result) => {
        if (result.ok) {
          toast.success(t('testPassed', { name: credential.name }))
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
    tErrors,
    orgId,
    now,
    providers: settings.data?.providers ?? [],
    active: settings.data?.active ?? null,
    activeProvider: settings.data?.providers.find((provider) => provider.isPrimary) ?? null,
    isLoading: settings.isPending,
    errorMessage: settings.error ? getErrorMessage(settings.error, tErrors) : null,
    errorReference: isApiError(settings.error) ? settings.error.requestId : undefined,
    refetch: () => void settings.refetch(),
    onTest,
    testingId: test.isPending ? test.variables : undefined,
    dialog,
    openAdd: () => {
      setDialog({ kind: SEARCH_DIALOG.ADD })
    },
    openDialog: setDialog,
    closeDialog: () => {
      setDialog(null)
    },
  }
}
