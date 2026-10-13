// SPDX-License-Identifier: AGPL-3.0-only
import { useFormatter, useTranslations } from 'next-intl'

import type { StatusTone } from '@surefy/ui/components/DataDisplay'
import { getErrorMessage } from '@surefy/web-core/errors'

import type { AgentEditorHeaderProps } from './AgentEditorHeader.types'

const STATUS_TONES = {
  draft: 'neutral',
  active: 'success',
  paused: 'warning',
  archived: 'neutral',
} as const satisfies Record<AgentEditorHeaderProps['status'], StatusTone>

/** The header's words: the version line ("Version 3 is live · 2 unpublished changes") and the save status. */
export function useAgentEditorHeaderController({
  status,
  liveVersion,
  changeCount,
  hasUnpublishedChanges,
  saveStatus,
}: AgentEditorHeaderProps) {
  const t = useTranslations('agents.editor.header')
  const tErrors = useTranslations('errors')
  const format = useFormatter()

  const changes = changeCount ?? (hasUnpublishedChanges ? null : 0)
  let changesText: string | null = null
  if (liveVersion !== null) {
    if (changes === null) changesText = t('changesUnknown')
    else changesText = t('changes', { count: changes })
  }

  let saveText: string | null = null
  if (saveStatus?.kind === 'saving') saveText = t('saving')
  else if (saveStatus?.kind === 'saved') {
    saveText = t('saved', {
      time: format.dateTime(new Date(saveStatus.at), { hour: '2-digit', minute: '2-digit' }),
    })
  } else if (saveStatus?.kind === 'error') {
    saveText = t('saveFailed', { reason: getErrorMessage(saveStatus.error, tErrors) })
  }

  return {
    t,
    tone: STATUS_TONES[status],
    statusLabel: t(`status.${status}`),
    versionText: liveVersion === null ? t('notPublished') : t('live', { version: liveVersion }),
    changesText,
    saveText,
    saveFailed: saveStatus?.kind === 'error',
    publishLabel: t('publish', { version: (liveVersion ?? 0) + 1 }),
  }
}
