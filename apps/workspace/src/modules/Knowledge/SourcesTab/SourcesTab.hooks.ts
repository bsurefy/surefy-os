// SPDX-License-Identifier: AGPL-3.0-only
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { getRowActions } from '@/modules/Settings/ConnectionsSettings/ConnectionsSettings.utils'
import { PERMISSIONS } from '@surefy/contracts'
import type { ConnectionDto } from '@surefy/contracts'
import { useCan } from '@surefy/web-core/access'
import { meQueries } from '@surefy/web-core/api/me'

/**
 * Whether the person may reconnect a connection, by the same rule as Settings › Connections:
 * Admins and Owners any of them, everyone else the ones they connected or own.
 */
export function useCanReconnect(): (connection: ConnectionDto) => boolean {
  const canManage = useCan(PERMISSIONS.CONNECTIONS_MANAGE)
  const { data: me } = useQuery(meQueries.current())
  return (connection) => getRowActions(connection, { canManage, userId: me?.user.id }).reconnect
}

/** An app's display name from its connection provider key ("Google Drive"). */
export function useProviderName(): (providerKey: string) => string {
  const tApps = useTranslations('settings.connections')
  return (providerKey) =>
    tApps.has(`apps.${providerKey}`) ? tApps(`apps.${providerKey}`) : providerKey
}
