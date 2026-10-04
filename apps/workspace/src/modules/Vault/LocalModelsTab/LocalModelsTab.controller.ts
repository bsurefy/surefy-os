// SPDX-License-Identifier: AGPL-3.0-only
import { useInfiniteQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { debounce, useQueryStates } from 'nuqs'
import { useState } from 'react'

import { modelQueries, useUpdateVaultModelMutation } from '@/api/models'
import { useSyncLocalServerMutation, useTestCredentialMutation, vaultQueries } from '@/api/vault'
import type { CredentialDto, VaultModelDto } from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'
import { useCurrentOrgId } from '@surefy/web-core/access'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'

import { KEYS_PAGE_SIZE } from '../Vault.constants'
import { SERVER_DIALOG } from './LocalModelsTab.constants'
import { localModelsSearchParams } from './LocalModelsTab.searchParams'

import type { ServerDialogKind } from './LocalModelsTab.constants'

const SEARCH_DEBOUNCE_MS = 300

export interface OpenServerDialog {
  kind: ServerDialogKind
  server?: CredentialDto
  model?: VaultModelDto
}

/** Vault › Local models: the servers, the models they serve, and enabling or disabling them. */
export function useLocalModelsTabController() {
  const t = useTranslations('vault.localModels')
  const tErrors = useTranslations('errors')
  const orgId = useCurrentOrgId()
  const [filters, setFilters] = useQueryStates(localModelsSearchParams)
  const [dialog, setDialog] = useState<OpenServerDialog | null>(null)

  const servers = useInfiniteQuery(
    vaultQueries.credentials(orgId, { kind: 'local_server', limit: KEYS_PAGE_SIZE }),
  )
  const models = useInfiniteQuery(
    modelQueries.list(orgId, {
      source: 'local',
      q: filters.q || undefined,
      limit: KEYS_PAGE_SIZE,
    }),
  )
  const test = useTestCredentialMutation(orgId)
  const sync = useSyncLocalServerMutation(orgId)
  const update = useUpdateVaultModelMutation(orgId)

  const serverList = servers.data?.pages.flatMap((page) => page.items) ?? []
  const modelList = models.data?.pages.flatMap((page) => page.items) ?? []
  const hasFilters = filters.q !== ''

  return {
    t,
    orgId,
    filters,
    servers: serverList,
    models: modelList,
    isLoadingServers: servers.isPending,
    isLoadingModels: models.isPending,
    isEmpty: !servers.isPending && serverList.length === 0,
    hasFilters,
    errorMessage: servers.error ? getErrorMessage(servers.error, tErrors) : null,
    modelsErrorMessage: models.error ? getErrorMessage(models.error, tErrors) : null,
    errorReference: isApiError(servers.error) ? servers.error.requestId : undefined,
    refetch: () => {
      void servers.refetch()
      void models.refetch()
    },
    hasMoreModels: models.hasNextPage,
    isLoadingMoreModels: models.isFetchingNextPage,
    onLoadMoreModels: () => void models.fetchNextPage(),
    onSearchChange: (value: string) =>
      void setFilters(
        { q: value || null },
        { limitUrlUpdates: debounce(SEARCH_DEBOUNCE_MS), history: 'replace' },
      ),
    onClearSearch: () => void setFilters({ q: null }),
    onTest: (server: CredentialDto) => {
      test.mutate(server.id, {
        onSuccess: (result) => {
          if (result.ok)
            toast.success(t('testPassed', { name: server.name, count: result.models.length }))
          else {
            toast.error(t('testFailed', { name: server.name }), {
              description: tErrors(result.reasonCode ?? 'LOCAL_SERVER_UNREACHABLE'),
            })
          }
        },
      })
    },
    testingId: test.isPending ? test.variables : undefined,
    onSync: (server: CredentialDto) => {
      sync.mutate(server.id, {
        onSuccess: (result) => {
          toast.success(
            t('synced', { name: server.name, added: result.added, removed: result.removed }),
          )
        },
      })
    },
    syncingId: sync.isPending ? sync.variables : undefined,
    /** Enabling is immediate; disabling asks first because agents and flows may use the model. */
    onToggleModel: (model: VaultModelDto, isEnabled: boolean) => {
      if (isEnabled) {
        update.mutate(
          { modelId: model.id, isEnabled: true },
          { onSuccess: () => toast.success(t('enabled', { name: model.displayName })) },
        )
      } else setDialog({ kind: SERVER_DIALOG.DISABLE_MODEL, model })
    },
    dialog: filters.add === 'server' && !dialog ? { kind: SERVER_DIALOG.ADD } : dialog,
    openDialog: setDialog,
    closeDialog: () => {
      setDialog(null)
      if (filters.add) void setFilters({ add: null })
    },
  }
}
