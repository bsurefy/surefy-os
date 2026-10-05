// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Plus, ServerCog } from 'lucide-react'

import { EmptyState, DataTableSearch, DataTableToolbar } from '@surefy/ui/components/DataDisplay'
import { ErrorState } from '@surefy/ui/components/Feedback'
import { Section } from '@surefy/ui/components/Layout'
import { LoadMore } from '@surefy/ui/components/Navigation'
import { Button } from '@surefy/ui/primitives/button'

import AddServerDialog from './AddServerDialog'
import { SERVER_DIALOG } from './LocalModelsTab.constants'
import { useLocalModelsTabController } from './LocalModelsTab.controller'
import ModelsTable from './ModelsTable'
import DisableModelDialog from '../ModelDialogs/DisableModelDialog'
import RemoveServerDialog from './ServerDialogs/RemoveServerDialog'
import ServersTable from './ServersTable'

/** Vault › Local models: servers with their status, and the models they serve. */
export default function LocalModelsTab() {
  const c = useLocalModelsTabController()
  const { t } = c

  const addServer = () => {
    c.openDialog({ kind: SERVER_DIALOG.ADD })
  }

  if (c.isEmpty) {
    return (
      <>
        <EmptyState
          icon={ServerCog}
          title={t('empty.title')}
          description={t('empty.description')}
          actionLabel={t('addServer')}
          onAction={addServer}
        />
        {c.dialog?.kind === SERVER_DIALOG.ADD && (
          <AddServerDialog orgId={c.orgId} onClose={c.closeDialog} />
        )}
      </>
    )
  }

  const modelsEmpty = c.hasFilters ? (
    <EmptyState
      icon={ServerCog}
      title={t('noResults.title')}
      description={t('noResults.description')}
      actionLabel={t('noResults.clear')}
      onAction={c.onClearSearch}
    />
  ) : (
    <EmptyState
      icon={ServerCog}
      title={t('noModels.title')}
      description={t('noModels.description')}
    />
  )

  return (
    <div className="flex flex-col gap-6">
      <Section
        title={t('serversTitle')}
        description={t('serversDescription')}
        actions={
          <Button icon={Plus} onClick={addServer}>
            {t('addServer')}
          </Button>
        }
      >
        {c.errorMessage ? (
          <ErrorState
            size="sm"
            title={t('loadError')}
            message={c.errorMessage}
            reference={c.errorReference}
            onRetry={c.refetch}
          />
        ) : (
          <ServersTable
            servers={c.servers}
            isLoading={c.isLoadingServers}
            emptyState={null}
            testingId={c.testingId}
            syncingId={c.syncingId}
            onTest={c.onTest}
            onSync={c.onSync}
            onRemove={(server) => {
              c.openDialog({ kind: SERVER_DIALOG.REMOVE, server })
            }}
          />
        )}
      </Section>
      <Section title={t('modelsTitle')} description={t('modelsDescription')}>
        <div className="flex flex-col gap-4">
          <DataTableToolbar>
            <DataTableSearch
              label={t('search.label')}
              placeholder={t('search.placeholder')}
              value={c.filters.q}
              onValueChange={c.onSearchChange}
            />
          </DataTableToolbar>
          {c.modelsErrorMessage ? (
            <ErrorState
              size="sm"
              title={t('modelsError')}
              message={c.modelsErrorMessage}
              onRetry={c.refetch}
            />
          ) : (
            <>
              <ModelsTable
                models={c.models}
                isLoading={c.isLoadingModels}
                emptyState={modelsEmpty}
                onToggle={c.onToggleModel}
              />
              <LoadMore
                label={t('loadMore')}
                onLoadMore={c.onLoadMoreModels}
                isLoading={c.isLoadingMoreModels}
                hasMore={c.hasMoreModels}
              />
            </>
          )}
        </div>
      </Section>
      {c.dialog?.kind === SERVER_DIALOG.ADD && (
        <AddServerDialog orgId={c.orgId} onClose={c.closeDialog} />
      )}
      {c.dialog?.kind === SERVER_DIALOG.REMOVE && c.dialog.server && (
        <RemoveServerDialog orgId={c.orgId} server={c.dialog.server} onClose={c.closeDialog} />
      )}
      {c.dialog?.kind === SERVER_DIALOG.DISABLE_MODEL && c.dialog.model && (
        <DisableModelDialog orgId={c.orgId} model={c.dialog.model} onClose={c.closeDialog} />
      )}
    </div>
  )
}
