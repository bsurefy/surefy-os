// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { KeyRound, Plus, ServerCog } from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

import { ROUTES } from '@/constants/routes'
import { DataTableSearch, DataTableToolbar, EmptyState } from '@surefy/ui/components/DataDisplay'
import { ErrorState, SkeletonCard } from '@surefy/ui/components/Feedback'
import { SelectInput } from '@surefy/ui/components/Forms'
import { Section } from '@surefy/ui/components/Layout'
import { LoadMore } from '@surefy/ui/components/Navigation'
import { Button } from '@surefy/ui/primitives/button'

import AddKeyDialog from './AddKeyDialog'
import KeyDialogsHost from './KeyDialogs'
import KeysTable from './KeysTable'
import ProviderCards from './ProviderCards'
import { KEY_DIALOG, KEY_SCOPES_FILTER } from './ProvidersTab.constants'
import { useProvidersTabController } from './ProvidersTab.controller'

const ALL_SCOPES = 'all'

/** Vault › Providers & keys: provider cards, the keys table, Add API key, rotate and revoke. */
export default function ProvidersTab() {
  const c = useProvidersTabController()
  const { t } = c
  const { orgSlug } = useParams<{ orgSlug: string }>()

  if (c.isEmpty) {
    return (
      <>
        <EmptyState
          icon={KeyRound}
          title={t('empty.title')}
          description={t('empty.description')}
          actionLabel={t('addKey')}
          onAction={() => {
            c.openDialog({ kind: KEY_DIALOG.ADD })
          }}
          secondaryAction={
            <Button variant="secondary" icon={ServerCog} asChild>
              <Link href={`${ROUTES.workspace.vault(orgSlug, 'local-models')}?add=server`}>
                {t('addServer')}
              </Link>
            </Button>
          }
        />
        {c.dialog?.kind === KEY_DIALOG.ADD && (
          <AddKeyDialog orgId={c.orgId} mode="organization" onClose={c.closeDialog} />
        )}
      </>
    )
  }

  const keysEmpty = c.hasFilters ? (
    <EmptyState
      icon={KeyRound}
      title={t('noResults.title')}
      description={t('noResults.description')}
      actionLabel={t('noResults.clear')}
      onAction={c.onClearFilters}
    />
  ) : (
    <EmptyState icon={KeyRound} title={t('noKeys.title')} description={t('noKeys.description')} />
  )

  let cards = <ProviderCards cards={c.cards} now={c.now} />
  if (c.isLoadingCards)
    cards = (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((card) => (
          <SkeletonCard key={card} lines={2} />
        ))}
      </div>
    )
  else if (c.cardsErrorMessage) {
    cards = (
      <ErrorState
        size="sm"
        title={t('cardsError')}
        message={c.cardsErrorMessage}
        onRetry={c.refetch}
      />
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <Section
        title={t('providersTitle')}
        description={t('providersDescription')}
        actions={
          <Button
            icon={Plus}
            onClick={() => {
              c.openDialog({ kind: KEY_DIALOG.ADD })
            }}
          >
            {t('addKey')}
          </Button>
        }
      >
        {cards}
      </Section>
      <Section title={t('keysTitle')} description={t('keysDescription')}>
        <div className="flex flex-col gap-4">
          <DataTableToolbar>
            <DataTableSearch
              label={t('search.label')}
              placeholder={t('search.placeholder')}
              value={c.filters.q}
              onValueChange={c.onSearchChange}
            />
            <SelectInput
              aria-label={t('scopeFilter.label')}
              options={[
                { value: ALL_SCOPES, label: t('scopeFilter.all') },
                ...KEY_SCOPES_FILTER.map((scope) => ({
                  value: scope,
                  label: t(`scopeFilter.${scope}`),
                })),
              ]}
              value={c.filters.scope ?? ALL_SCOPES}
              onValueChange={(value) => {
                c.onScopeChange(value === ALL_SCOPES ? null : value)
              }}
            />
          </DataTableToolbar>
          {c.errorMessage ? (
            <ErrorState
              size="sm"
              title={t('loadError')}
              message={c.errorMessage}
              reference={c.errorReference}
              onRetry={c.refetch}
            />
          ) : (
            <>
              <KeysTable
                keys={c.credentials}
                now={c.now}
                isLoading={c.isLoading}
                emptyState={keysEmpty}
                testingId={c.isTesting}
                onTest={c.onTest}
                onAction={(kind, credential) => {
                  c.openDialog({ kind, credential })
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
        </div>
      </Section>
      {c.dialog?.kind === KEY_DIALOG.ADD && (
        <AddKeyDialog orgId={c.orgId} mode="organization" onClose={c.closeDialog} />
      )}
      {c.dialog?.kind === KEY_DIALOG.ROTATE && c.dialog.credential && (
        <AddKeyDialog
          orgId={c.orgId}
          mode="organization"
          rotate={c.dialog.credential}
          onClose={c.closeDialog}
        />
      )}
      <KeyDialogsHost orgId={c.orgId} dialog={c.dialog} onClose={c.closeDialog} />
    </div>
  )
}
