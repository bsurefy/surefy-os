// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Globe, Plus } from 'lucide-react'
import { useFormatter } from 'next-intl'

import type { CredentialDto } from '@surefy/contracts'
import { DataTable, EmptyState, StatusPill } from '@surefy/ui/components/DataDisplay'
import type { DataTableColumn } from '@surefy/ui/components/DataDisplay'
import { Banner, ErrorState } from '@surefy/ui/components/Feedback'
import { Section } from '@surefy/ui/components/Layout'
import { Button } from '@surefy/ui/primitives/button'
import { DropdownMenuItem, DropdownMenuSeparator } from '@surefy/ui/primitives/dropdown-menu'

import AddSearchProviderDialog from './AddSearchProviderDialog'
import { RevokeSearchProviderDialog, SwitchSearchProviderDialog } from './SearchProviderDialogs'
import { SEARCH_DIALOG } from './SearchProviders.constants'
import { useSearchProvidersController } from './SearchProviders.controller'
import RowMenu from '../../RowMenu'
import { getExpiringDays, getMaskedValue, getProviderName, getStatusTone } from '../../Vault.utils'

/**
 * Vault › Providers & keys › Search providers (V1): the Brave and Tavily keys and SearXNG
 * addresses web search can use. One of them is primary and serves every search of the organization.
 */
export default function SearchProviders() {
  const c = useSearchProvidersController()
  const { t } = c
  const format = useFormatter()

  const columns: DataTableColumn<CredentialDto>[] = [
    {
      id: 'name',
      header: t('columns.name'),
      isHideable: false,
      cell: (provider) => (
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-body truncate font-medium">{provider.name}</span>
          {provider.isPrimary && <StatusPill label={t('primary')} tone="info" />}
        </div>
      ),
    },
    {
      id: 'provider',
      header: t('columns.provider'),
      cell: (provider) => getProviderName(provider.providerKey),
    },
    {
      id: 'value',
      header: t('columns.value'),
      cell: (provider) =>
        provider.baseUrl ? (
          <span className="font-mono break-all">{provider.baseUrl}</span>
        ) : (
          <span className="font-mono">{getMaskedValue(provider.secretLast4)}</span>
        ),
    },
    {
      id: 'lastUsed',
      header: t('columns.lastUsed'),
      cell: (provider) =>
        provider.lastUsedAt ? format.relativeTime(new Date(provider.lastUsedAt)) : t('never'),
    },
    {
      id: 'status',
      header: t('columns.status'),
      cell: (provider) => {
        const days = getExpiringDays(provider, c.now)
        return (
          <div className="flex flex-col items-start gap-1">
            <StatusPill
              label={t(`status.${provider.status}`)}
              tone={getStatusTone(provider.status)}
            />
            {provider.statusReasonCode && provider.status !== 'active' && (
              <span className="text-caption text-muted-foreground max-w-56">
                {c.tErrors(provider.statusReasonCode)}
              </span>
            )}
            {days !== null && (
              <span className="text-caption text-warning">{t('expiresIn', { days })}</span>
            )}
          </div>
        )
      },
    },
  ]

  const rowActions = (provider: CredentialDto) => (
    <RowMenu label={t('rowActions', { name: provider.name })}>
      <DropdownMenuItem
        disabled={c.testingId === provider.id}
        onSelect={() => {
          c.onTest(provider)
        }}
      >
        {t('actions.test')}
      </DropdownMenuItem>
      {!provider.isPrimary && (
        <DropdownMenuItem
          onSelect={() => {
            c.openDialog({ kind: SEARCH_DIALOG.SWITCH, credential: provider })
          }}
        >
          {t('actions.makePrimary')}
        </DropdownMenuItem>
      )}
      <DropdownMenuSeparator />
      <DropdownMenuItem
        className="text-destructive"
        onSelect={() => {
          c.openDialog({ kind: SEARCH_DIALOG.REVOKE, credential: provider })
        }}
      >
        {t('actions.revoke')}
      </DropdownMenuItem>
    </RowMenu>
  )

  let summary = null
  if (!c.isLoading && !c.errorMessage) {
    if (c.active === null) {
      summary = (
        <Banner
          tone="warning"
          title={t('noneActive.title')}
          description={t('noneActive.description')}
        />
      )
    } else if (c.active.source === 'install') {
      summary = <Banner tone="info" title={t('installActive')} />
    } else if (c.activeProvider) {
      summary = (
        <p className="text-body text-foreground-secondary">
          {t('active', { name: c.activeProvider.name })}
        </p>
      )
    }
  }

  return (
    <Section
      id="search-providers"
      title={t('title')}
      description={t('description')}
      actions={
        <Button icon={Plus} onClick={c.openAdd}>
          {t('add')}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {summary}
        {c.errorMessage ? (
          <ErrorState
            size="sm"
            title={t('loadError')}
            message={c.errorMessage}
            reference={c.errorReference}
            onRetry={c.refetch}
          />
        ) : (
          <DataTable
            columns={columns}
            data={c.providers}
            getRowId={(provider) => provider.id}
            labels={{ caption: t('tableLabel'), actions: t('columns.actions') }}
            rowActions={rowActions}
            isLoading={c.isLoading}
            emptyState={
              <EmptyState
                icon={Globe}
                title={t('empty.title')}
                description={t('empty.description')}
              />
            }
          />
        )}
      </div>
      {c.dialog?.kind === SEARCH_DIALOG.ADD && (
        <AddSearchProviderDialog orgId={c.orgId} onClose={c.closeDialog} />
      )}
      {c.dialog?.kind === SEARCH_DIALOG.SWITCH && c.dialog.credential && (
        <SwitchSearchProviderDialog
          orgId={c.orgId}
          credential={c.dialog.credential}
          onClose={c.closeDialog}
        />
      )}
      {c.dialog?.kind === SEARCH_DIALOG.REVOKE && c.dialog.credential && (
        <RevokeSearchProviderDialog
          orgId={c.orgId}
          credential={c.dialog.credential}
          onClose={c.closeDialog}
        />
      )}
    </Section>
  )
}
