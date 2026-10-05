// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useTranslations } from 'next-intl'

/** "Switched to {model}": the history stays, the next answer comes from another model. */
export default function ModelSwitchDivider({ modelName }: Readonly<{ modelName: string }>) {
  const t = useTranslations('chat.thread')
  return (
    <div
      role="separator"
      aria-label={t('switched', { model: modelName })}
      className="flex items-center gap-3"
    >
      <span className="bg-border h-px flex-1" />
      <span className="text-caption text-muted-foreground">
        {t('switched', { model: modelName })}
      </span>
      <span className="bg-border h-px flex-1" />
    </div>
  )
}
