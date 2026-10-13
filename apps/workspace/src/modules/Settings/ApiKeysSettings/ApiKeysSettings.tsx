// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { KeyRound, Plus, SearchX } from 'lucide-react'

import { EmptyState, DataTableSearch, DataTableToolbar } from '@surefy/ui/components/DataDisplay'
import { ErrorState } from '@surefy/ui/components/Feedback'
import { SelectInput } from '@surefy/ui/components/Forms'
import { PageHeader } from '@surefy/ui/components/Layout'
import { LoadMore } from '@surefy/ui/components/Navigation'
import { Button } from '@surefy/ui/primitives/button'

import ApiKeyDialogs from './ApiKeyDialogs'
import ApiKeyDrawer from './ApiKeyDrawer'
import { API_KEY_DIALOG } from './ApiKeysSettings.constants'
import { useApiKeysSettingsController } from './ApiKeysSettings.controller'
import ApiKeysTable from './ApiKeysTable'

/** Settings › API keys: keys that let the organization's own software call SurefyOS. */
export default function ApiKeysSettings() {
  const c = useApiKeysSettingsController()
  const { t } = c

  const openCreate = () => {
    c.openDialog({ kind: API_KEY_DIALOG.CREATE })
  }

  const emptyState = c.hasFilters ? (
    <EmptyState
      icon={SearchX}
      title={t('noResults.title')}
      description={t('noResults.description')}
      actionLabel={t('noResults.clear')}
      onAction={c.onClearFilters}
    />
  ) : (
    <EmptyState
      icon={KeyRound}
      title={t('empty.title')}
      description={t('empty.description')}
      actionLabel={c.canManage ? t('create.open') : undefined}
      onAction={c.canManage ? openCreate : undefined}
    />
  )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          c.canManage ? (
            <Button icon={Plus} onClick={openCreate}>
              {t('create.open')}
            </Button>
          ) : undefined
        }
      />
      <DataTableToolbar>
        <DataTableSearch
          label={t('search.label')}
          placeholder={t('search.placeholder')}
          value={c.filters.q}
          onValueChange={c.onSearchChange}
        />
        <SelectInput
          aria-label={t('filters.status')}
          options={c.statusOptions}
          value={c.filters.status}
          onValueChange={(status) => void c.onFiltersChange({ status })}
          className="w-40"
        />
      </DataTableToolbar>
      <section aria-busy={c.isLoading || undefined}>
        {c.errorMessage ? (
          <ErrorState
            title={t('loadError')}
            message={c.errorMessage}
            reference={c.errorReference}
            onRetry={c.refetch}
          />
        ) : (
          <>
            <ApiKeysTable
              rows={c.rows}
              isLoading={c.isLoading}
              sort={c.filters.sort}
              onSortChange={(sort) =>
                void c.onFiltersChange({ sort: sort as typeof c.filters.sort })
              }
              emptyState={emptyState}
              canManage={c.canManage}
              onOpen={c.onOpenKey}
              onAction={(kind, apiKey) => {
                c.openDialog({ kind, apiKey })
              }}
            />
            <LoadMore
              label={t('loadMore')}
              onLoadMore={c.onLoadMore}
              isLoading={c.isLoadingMore}
              hasMore={c.hasMore}
            />
          </>
        )}
      </section>
      {c.openKey && (
        <ApiKeyDrawer
          orgId={c.orgId}
          apiKey={c.openKey}
          canManage={c.canManage}
          onClose={c.onCloseKey}
          onRename={() => {
            if (c.openKey) c.openDialog({ kind: API_KEY_DIALOG.RENAME, apiKey: c.openKey })
          }}
          onRevoke={() => {
            if (c.openKey) c.openDialog({ kind: API_KEY_DIALOG.REVOKE, apiKey: c.openKey })
          }}
          onCreateReplacement={openCreate}
        />
      )}
      <ApiKeyDialogs
        orgId={c.orgId}
        dialog={c.dialog}
        hasOtherActiveKeys={c.dialog?.apiKey ? c.hasOtherActiveKeys(c.dialog.apiKey) : false}
        onClose={c.closeDialog}
      />
    </div>
  )
}
