// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Globe } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { cn } from '@surefy/ui/lib/utils'
import { Toggle } from '@surefy/ui/primitives/toggle'

/**
 * The composer's web search switch (chat.md §3): for the next answers of this chat, the model may
 * search the web and cite what it found. Shown only when the person's team may search the web.
 */
export default function WebSearchToggle({
  isOn,
  isDisabled,
  onToggle,
}: Readonly<{ isOn: boolean; isDisabled: boolean; onToggle: () => void }>) {
  const t = useTranslations('chat.thread.composer.webSearch')
  return (
    <Toggle
      variant="outline"
      size="sm"
      pressed={isOn}
      disabled={isDisabled}
      aria-label={t('label')}
      title={isOn ? t('on') : t('off')}
      className={cn('h-8 gap-1.5 rounded-lg px-2', isOn && 'text-primary')}
      onPressedChange={onToggle}
    >
      <Globe aria-hidden className="size-4" />
      <span className="text-label hidden sm:inline">{t('short')}</span>
    </Toggle>
  )
}
