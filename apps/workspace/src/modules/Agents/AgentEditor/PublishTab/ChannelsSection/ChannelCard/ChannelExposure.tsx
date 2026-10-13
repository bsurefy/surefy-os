// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useTranslations } from 'next-intl'

import type { ExternalChannelType } from '@surefy/contracts'

/**
 * What anyone on an external channel can reach: there is no signed-in person there, so the agent
 * uses its own knowledge and tools (agents.md §2).
 */
export default function ChannelExposure({
  type,
  exposure,
}: Readonly<{ type: ExternalChannelType; exposure: string | null }>) {
  const t = useTranslations('agents.editor.publish.channels.exposure')
  return (
    <p className="text-body text-foreground">
      {exposure ? t(type, { names: exposure }) : t('nothing')}
    </p>
  )
}
