// SPDX-License-Identifier: AGPL-3.0-only
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { ROUTES } from '@/constants/routes'
import { PERMISSIONS } from '@surefy/contracts'
import type { ConnectionDto } from '@surefy/contracts'
import { useCan, useCurrentOrgId } from '@surefy/web-core/access'

import { CONNECTION_PROVIDER_OF_TOOL } from '../ToolsTab.constants'

import type { ConnectionPickerProps } from './ConnectionPicker.types'

/** The picker's text, and the Add connection dialog opened from it. */
export function useConnectionPickerController({
  kind,
  onValueChange,
}: Pick<ConnectionPickerProps, 'kind' | 'onValueChange'>) {
  const t = useTranslations('agents.editor.tools.connection')
  const tApps = useTranslations('settings.connections')
  const orgId = useCurrentOrgId()
  const canManage = useCan(PERMISSIONS.CONNECTIONS_MANAGE)
  const { orgSlug, agentId } = useParams<{ orgSlug: string; agentId: string }>()
  const [isAdding, setIsAdding] = useState(false)

  return {
    t,
    orgId,
    canManage,
    isAdding,
    providerKey: CONNECTION_PROVIDER_OF_TOOL[kind],
    // an OAuth sign-in leaves the page: it comes back to this tab
    returnTo: ROUTES.workspace.agent(orgSlug, agentId, 'tools'),
    providerName: (providerKey: string) =>
      tApps.has(`apps.${providerKey}`) ? tApps(`apps.${providerKey}`) : providerKey,
    onOpenAdd: () => {
      setIsAdding(true)
    },
    onCloseAdd: () => {
      setIsAdding(false)
    },
    onConnected: (connection: ConnectionDto) => {
      onValueChange(connection.id)
    },
  }
}
