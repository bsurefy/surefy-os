// SPDX-License-Identifier: AGPL-3.0-only
'use no memo'

import { useInfiniteQuery } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { connectionQueries } from '@/api/connections'
import {
  useCreateKnowledgeConnectorMutation,
  useUpdateKnowledgeSourceMutation,
} from '@/api/knowledge'
import { ROUTES } from '@/constants/routes'
import {
  KNOWLEDGE_CONNECTOR_CONNECTION_PROVIDERS,
  KNOWLEDGE_CONNECTOR_SYNC_EVERY,
  PERMISSIONS,
} from '@surefy/contracts'
import type {
  ConnectionDto,
  KnowledgeBaseDto,
  KnowledgeConnectorProvider,
  KnowledgeSourceDto,
} from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'
import { useCan } from '@surefy/web-core/access'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'
import { useForm } from '@surefy/web-core/forms'

import { CONNECTION_LOOKUP_LIMIT } from '../SourcesTab.constants'
import { useCanReconnect, useProviderName } from '../SourcesTab.hooks'
import { createConnectorFormSchema } from './ConnectorDialog.schema'

import type { ConnectorFolder, ConnectorFormValues } from './ConnectorDialog.schema'
import type { BaseSyntheticEvent } from 'react'

function toValues(source: KnowledgeSourceDto | undefined): ConnectorFormValues {
  return source?.connector
    ? {
        connectionId: source.connectionId,
        folders: source.connector.folders,
        syncEvery: source.connector.syncEvery,
        name: source.name,
      }
    : { connectionId: null, folders: [], syncEvery: 'daily', name: '' }
}

/**
 * Connect Google Drive or Notion: the account (one the person may use, or a new one added here),
 * the folders or pages to sync, and how often. With a `source` it changes that source's folders,
 * schedule and name; the account stays.
 */
export function useConnectorDialogController({
  orgId,
  base,
  provider,
  source,
  onClose,
}: {
  orgId: string
  base: KnowledgeBaseDto
  provider: KnowledgeConnectorProvider
  source?: KnowledgeSourceDto
  onClose: () => void
}) {
  const t = useTranslations('knowledge.detail.sources.connector')
  const tErrors = useTranslations('errors')
  const { orgSlug } = useParams<{ orgSlug: string }>()
  const canManageConnections = useCan(PERMISSIONS.CONNECTIONS_MANAGE)
  const canReconnect = useCanReconnect()
  const providerName = useProviderName()
  const providerKey = KNOWLEDGE_CONNECTOR_CONNECTION_PROVIDERS[provider]
  const connections = useInfiniteQuery(
    connectionQueries.list(orgId, { usable: true, providerKey, limit: CONNECTION_LOOKUP_LIMIT }),
  )
  const create = useCreateKnowledgeConnectorMutation(orgId, base.id, { silent: true })
  const update = useUpdateKnowledgeSourceMutation(orgId, base.id, { silent: true })
  const [isAdding, setIsAdding] = useState(false)
  const [reconnecting, setReconnecting] = useState<ConnectionDto | null>(null)
  const [schema] = useState(() =>
    createConnectorFormSchema({
      connection: t('account.required'),
      folders: t(`folders.required.${provider}`),
      tooManyFolders: t('folders.tooMany'),
    }),
  )
  const form = useForm({ schema, defaultValues: toValues(source) })
  const items = connections.data?.pages.flatMap((page) => page.items) ?? []
  const connectionId = form.watch('connectionId')
  const connection = items.find(({ id }) => id === connectionId) ?? null
  const isEditing = source !== undefined

  // One working account needs no choosing, also when a sign-in started here comes back
  const active = items.filter(({ status }) => status === 'active')
  const onlyAccountId = !isEditing && active.length === 1 ? active[0]?.id : undefined
  useEffect(() => {
    if (connectionId === null && onlyAccountId) form.setValue('connectionId', onlyAccountId)
  }, [connectionId, onlyAccountId, form])

  const sourcesPath = ROUTES.workspace.knowledgeBase(orgSlug, base.id, 'sources')

  const submit = form.handleSubmit(async (values) => {
    const name = values.name || undefined
    try {
      if (source) {
        const saved = await update.mutateAsync({
          sourceId: source.id,
          name,
          connector: { folders: values.folders, syncEvery: values.syncEvery },
        })
        toast.success(t('saved', { name: saved.name }))
      } else if (values.connectionId) {
        const created = await create.mutateAsync({
          connectionId: values.connectionId,
          folders: values.folders,
          syncEvery: values.syncEvery,
          name,
        })
        toast.success(t('added', { name: created.name }))
      }
      onClose()
    } catch (error) {
      if (!isApiError(error)) throw error
      form.setError('root', { message: getErrorMessage(error, tErrors) })
    }
  })

  return {
    t,
    form,
    formError: form.formState.errors.root?.message,
    isPending: form.formState.isSubmitting,
    isEditing,
    ownFolderIds: source?.connector?.folders.map(({ externalId }) => externalId) ?? [],
    appName: providerName(providerKey),
    providerKey,
    providerName,
    canManageConnections,
    accountLabels: {
      placeholder: t('account.placeholder'),
      search: t('account.search'),
      empty: t('account.empty'),
      loading: t('account.loading'),
    },
    accountOptions: items.map((item) => ({
      value: item.id,
      label: item.name,
      description: [
        item.externalAccountLabel,
        item.status === 'active' ? null : t(`account.status.${item.status}`),
      ]
        .filter((part) => part !== null)
        .join(' · '),
    })),
    isLoadingAccounts: connections.isPending,
    connection,
    /** The picked account's sign-in expired: folders cannot be listed until it is reconnected. */
    isExpired: connection?.status === 'expired',
    canReconnect: connection !== null && canReconnect(connection),
    syncOptions: KNOWLEDGE_CONNECTOR_SYNC_EVERY.map((value) => ({
      value,
      label: t(`syncEvery.${value}`),
    })),
    // An account sign-in leaves the page: it comes back to this dialog
    addReturnTo: `${sourcesPath}?connect=${provider}`,
    reconnectReturnTo: isEditing ? sourcesPath : `${sourcesPath}?connect=${provider}`,
    onAccountChange: (id: string | null) => {
      // folders belong to an account: another account starts with none picked
      form.setValue('connectionId', id, { shouldValidate: true })
      form.setValue('folders', [])
    },
    onFoldersChange: (folders: ConnectorFolder[]) => {
      form.setValue('folders', folders, { shouldValidate: form.formState.isSubmitted })
    },
    isAdding,
    onOpenAdd: () => {
      setIsAdding(true)
    },
    onCloseAdd: () => {
      setIsAdding(false)
    },
    onConnected: (added: ConnectionDto) => {
      form.setValue('connectionId', added.id, { shouldValidate: true })
      form.setValue('folders', [])
    },
    reconnecting,
    onReconnect: () => {
      setReconnecting(connection)
    },
    onCloseReconnect: () => {
      setReconnecting(null)
    },
    onSubmit: (event: BaseSyntheticEvent) => {
      void submit(event)
    },
  }
}
