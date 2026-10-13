// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { connectionQueries, useRevokeConnectionMutation } from '@/api/connections'
import type { ConnectionDto } from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'
import { ConfirmDialog } from '@surefy/ui/components/Overlay'
import { Button } from '@surefy/ui/primitives/button'
import { getErrorMessage } from '@surefy/web-core/errors'

import { getImpactSummary } from '../ConnectionsSettings.utils'

import type { ReactNode } from 'react'

/**
 * Disconnect a connection (T2): lists what depends on it, from the same data as Used by, and says
 * it cannot be reconnected. Disconnect stays disabled until the dependents are loaded.
 */
export default function DisconnectConnectionDialog({
  orgId,
  connection,
  onClose,
}: Readonly<{ orgId: string; connection: ConnectionDto; onClose: () => void }>) {
  const t = useTranslations('settings.connections.disconnect')
  const tErrors = useTranslations('errors')
  const impact = useQuery(connectionQueries.impact(orgId, connection.id))
  const revoke = useRevokeConnectionMutation(orgId, { silent: true })

  const summary = impact.data ? getImpactSummary(impact.data) : null
  const lines: ReactNode[] = []
  for (const group of summary?.groups ?? []) {
    lines.push(
      t.has(`types.${group.type}`)
        ? t(`types.${group.type}`, {
            count: group.count,
            names: group.names.join(', '),
            more: group.more,
          })
        : t('types.other', { type: group.type, count: group.count }),
    )
  }

  let error: ReactNode
  if (impact.error) {
    error = (
      <span className="flex flex-wrap items-center gap-2">
        {t('impactUnavailable')}
        <Button
          variant="link"
          size="sm"
          onClick={() => {
            void impact.refetch()
          }}
        >
          {t('retry')}
        </Button>
      </span>
    )
  } else if (revoke.error) {
    error = getErrorMessage(revoke.error, tErrors)
  }

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      tier="T2"
      tone="destructive"
      title={t('title', { name: connection.name })}
      description={summary?.total === 0 ? t('unused') : t('description')}
      impact={lines}
      labels={{ confirm: t('confirm') }}
      error={error}
      confirmDisabled={!impact.data}
      onConfirm={async () => {
        // the names must be the ones at the moment of confirming
        if (!impact.data) throw new Error('The impact is not loaded yet')
        await revoke.mutateAsync(connection.id)
        toast.success(t('disconnected', { name: connection.name }))
      }}
    />
  )
}
