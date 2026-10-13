// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useTranslations } from 'next-intl'

import { useRollbackAgentMutation } from '@/api/agents'
import type { AgentVersionDto } from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'
import { ConfirmDialog } from '@surefy/ui/components/Overlay'
import { getErrorMessage } from '@surefy/web-core/errors'

/**
 * Roll back (T2): says who it affects at once, and that the draft is left as it is. The earlier
 * version goes live; no new version is created.
 */
export default function RollbackDialog({
  orgId,
  agentId,
  version,
  onClose,
}: Readonly<{ orgId: string; agentId: string; version: AgentVersionDto; onClose: () => void }>) {
  const t = useTranslations('agents.editor.versions.rollback')
  const tErrors = useTranslations('errors')
  const rollback = useRollbackAgentMutation(orgId, agentId, { silent: true })

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      tier="T2"
      tone="destructive"
      title={t('title', { version: version.version })}
      description={t('description', { version: version.version })}
      impact={[t('draft'), t('channels')]}
      labels={{ confirm: t('confirm', { version: version.version }) }}
      error={rollback.error ? getErrorMessage(rollback.error, tErrors) : undefined}
      onConfirm={async () => {
        await rollback.mutateAsync(version.id)
        toast.success(t('done', { version: version.version }))
      }}
    />
  )
}
