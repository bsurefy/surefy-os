// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Bot } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'

import { ROUTES } from '@/constants/routes'
import { toRoute } from '@/modules/Workspace'
import { IconTile } from '@surefy/ui/components/DataDisplay'
import { Button } from '@surefy/ui/primitives/button'

/**
 * In place of the composer when the chat's agent was paused, archived or unshared (chat.md §4):
 * "Support triage isn't available to you anymore". The history stays, read only.
 */
export default function AgentUnavailable({
  orgSlug,
  agentName,
}: Readonly<{ orgSlug: string; agentName: string | null }>) {
  const t = useTranslations('chat.thread.agentUnavailable')
  return (
    <section
      role="status"
      className="border-border bg-surface flex flex-col items-start gap-3 rounded-[0.875rem] border p-4 sm:flex-row sm:items-center"
    >
      <IconTile icon={Bot} size="sm" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-label font-semibold">
          {agentName ? t('title', { name: agentName }) : t('titleUnknown')}
        </p>
        <p className="text-caption text-muted-foreground">{t('description')}</p>
      </div>
      <Button variant="secondary" size="sm" asChild>
        <Link href={toRoute(ROUTES.workspace.chat(orgSlug))}>{t('action')}</Link>
      </Button>
    </section>
  )
}
