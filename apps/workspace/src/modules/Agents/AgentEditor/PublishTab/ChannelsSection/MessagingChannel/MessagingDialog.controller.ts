// SPDX-License-Identifier: AGPL-3.0-only
'use no memo'

import { useInfiniteQuery } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { connectionQueries } from '@/api/connections'
import { ROUTES } from '@/constants/routes'
import { PERMISSIONS, SLACK_RESPOND_TO } from '@surefy/contracts'
import type { ConnectionDto } from '@surefy/contracts'
import { useCan, useCurrentOrgId } from '@surefy/web-core/access'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'
import { useForm } from '@surefy/web-core/forms'

import { CONNECTION_LOOKUP_LIMIT } from '../ChannelsSection.constants'
import {
  createMessagingFormSchema,
  messagingToValues,
  toMessagingRequest,
} from './MessagingChannel.schema'

import type { MessagingDialogProps } from './MessagingChannel.types'
import type { BaseSyntheticEvent } from 'react'

/**
 * Slack or WhatsApp: the connection the channel answers through, and how it answers. The accounts
 * listed are the ones the person may use; a connection added here is picked at once.
 */
export function useMessagingDialogController({
  type,
  initial,
  onSave,
  onClose,
}: Pick<MessagingDialogProps, 'type' | 'initial' | 'onSave' | 'onClose'>) {
  const t = useTranslations('agents.editor.publish.channels.messaging')
  const tConnection = useTranslations('agents.editor.tools.connection')
  const tApps = useTranslations('settings.connections')
  const tErrors = useTranslations('errors')
  const orgId = useCurrentOrgId()
  const { orgSlug, agentId } = useParams<{ orgSlug: string; agentId: string }>()
  const canManageConnections = useCan(PERMISSIONS.CONNECTIONS_MANAGE)
  const connections = useInfiniteQuery(
    connectionQueries.list(orgId, {
      usable: true,
      providerKey: type,
      limit: CONNECTION_LOOKUP_LIMIT,
    }),
  )
  const [isAdding, setIsAdding] = useState(false)
  const [schema] = useState(() =>
    createMessagingFormSchema(type, {
      connection: t('connection.required'),
      slackChannels: t('slack.channels.tooMany'),
      businessAccount: t('whatsapp.businessAccount.required'),
      welcome: t('whatsapp.welcome.tooLong'),
    }),
  )
  const form = useForm({
    schema,
    defaultValues: messagingToValues(
      // a live channel whose connection was removed has none to start from
      initial === undefined || initial.connectionId === '' ? null : initial.connectionId,
      initial?.type === 'slack' ? initial.config : undefined,
      initial?.type === 'whatsapp' ? initial.config : undefined,
    ),
  })

  const submit = form.handleSubmit(async (values) => {
    try {
      await onSave(toMessagingRequest(type, values))
      onClose()
    } catch (error) {
      if (!isApiError(error)) throw error
      form.setError('root', { message: getErrorMessage(error, tErrors) })
    }
  })

  const items = connections.data?.pages.flatMap((page) => page.items) ?? []

  return {
    t,
    form,
    formError: form.formState.errors.root?.message,
    isPending: form.formState.isSubmitting,
    orgId,
    canManageConnections,
    pickerLabels: {
      placeholder: tConnection('placeholder'),
      search: tConnection('search'),
      empty: tConnection('empty'),
      loading: tConnection('loading'),
    },
    connectionOptions: items.map((connection) => ({
      value: connection.id,
      label: connection.name,
      description: [
        connection.externalAccountLabel,
        connection.status === 'active' ? null : tConnection(`status.${connection.status}`),
      ]
        .filter((part) => part !== null)
        .join(' · '),
    })),
    isLoadingConnections: connections.isPending,
    respondToOptions: SLACK_RESPOND_TO.map((value) => ({
      value,
      label: t(`slack.respondTo.${value}`),
    })),
    isAdding,
    // an OAuth sign-in leaves the page: it comes back to this tab
    returnTo: ROUTES.workspace.agent(orgSlug, agentId, 'publish'),
    providerName: (providerKey: string) =>
      tApps.has(`apps.${providerKey}`) ? tApps(`apps.${providerKey}`) : providerKey,
    onOpenAdd: () => {
      setIsAdding(true)
    },
    onCloseAdd: () => {
      setIsAdding(false)
    },
    onConnected: (connection: ConnectionDto) => {
      form.setValue('connectionId', connection.id, { shouldValidate: true })
    },
    onSubmit: (event: BaseSyntheticEvent) => {
      void submit(event)
    },
  }
}
