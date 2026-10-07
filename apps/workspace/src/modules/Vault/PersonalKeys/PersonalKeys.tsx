// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { KeyRound, Plus } from 'lucide-react'

import { EmptyState } from '@surefy/ui/components/DataDisplay'
import { ErrorState } from '@surefy/ui/components/Feedback'
import { Section } from '@surefy/ui/components/Layout'
import { LoadMore } from '@surefy/ui/components/Navigation'
import { Button } from '@surefy/ui/primitives/button'

import { usePersonalKeysController } from './PersonalKeys.controller'
import AddKeyDialog from '../ProvidersTab/AddKeyDialog'
import RevokeKeyDialog from '../ProvidersTab/KeyDialogs/RevokeKeyDialog'
import KeysTable from '../ProvidersTab/KeysTable'
import { KEY_DIALOG } from '../ProvidersTab/ProvidersTab.constants'

/**
 * Profile › API keys: the person's own provider keys, added with the same dialog as the Vault but
 * with the scope fixed to "Just me". Hidden when the organization does not allow personal keys.
 */
export default function PersonalKeys() {
  const c = usePersonalKeysController()
  const { t } = c

  if (c.isDisabledByPolicy) return null

  return (
    <Section
      title={t('title')}
      description={t('description')}
      actions={
        <Button icon={Plus} onClick={c.onAdd}>
          {t('add')}
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
        <div className="flex flex-col gap-4">
          <KeysTable
            keys={c.keys}
            now={c.now}
            isLoading={c.isLoading}
            testingId={c.testingId}
            onTest={c.onTest}
            onAction={(kind, credential) => {
              if (kind === KEY_DIALOG.REVOKE) c.onRevoke(credential)
            }}
            emptyState={
              <EmptyState
                icon={KeyRound}
                title={t('empty.title')}
                description={t('empty.description')}
              />
            }
          />
          <LoadMore
            label={t('loadMore')}
            onLoadMore={c.onLoadMore}
            isLoading={c.isLoadingMore}
            hasMore={c.hasMore}
          />
        </div>
      )}
      {c.isAdding && <AddKeyDialog orgId={c.orgId} mode="personal" onClose={c.onCloseAdd} />}
      {c.revoking && (
        <RevokeKeyDialog orgId={c.orgId} credential={c.revoking} onClose={c.onCloseRevoke} />
      )}
    </Section>
  )
}
