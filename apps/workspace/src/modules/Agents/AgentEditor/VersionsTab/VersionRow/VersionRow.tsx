// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { ChevronDown, ChevronRight } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { useId } from 'react'

import type { AgentVersionDto } from '@surefy/contracts'
import { StatusPill } from '@surefy/ui/components/DataDisplay'
import { Button } from '@surefy/ui/primitives/button'

import VersionDiff from './VersionDiff'

interface VersionRowProps {
  orgId: string
  agentId: string
  version: AgentVersionDto
  /** The version before this one, which its changes are read against; none for the first. */
  previousId: string | null
  isExpanded: boolean
  canRollBack: boolean
  onToggle: () => void
  onRollback: () => void
}

/** One version: its number, who published it and when, the notes, what it changed, and Roll back. */
export default function VersionRow({
  orgId,
  agentId,
  version,
  previousId,
  isExpanded,
  canRollBack,
  onToggle,
  onRollback,
}: Readonly<VersionRowProps>) {
  const t = useTranslations('agents.editor.versions')
  const format = useFormatter()
  const diffId = useId()

  return (
    <li className="border-border flex flex-col gap-3 rounded-lg border px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="text-body text-foreground font-medium">
              {t('version', { version: version.version })}
            </span>
            {version.isLive && <StatusPill tone="success" label={t('live')} />}
          </div>
          <span className="text-caption text-muted-foreground">
            {t('publishedBy', {
              name: version.publishedBy?.name ?? t('unknownAuthor'),
              date: format.dateTime(new Date(version.publishedAt), {
                dateStyle: 'medium',
                timeStyle: 'short',
              }),
            })}
          </span>
          {version.notes && <span className="text-body text-foreground">{version.notes}</span>}
        </div>
        <Button
          variant="ghost"
          size="sm"
          icon={isExpanded ? ChevronDown : ChevronRight}
          aria-expanded={isExpanded}
          aria-controls={diffId}
          aria-label={t(isExpanded ? 'hideChanges' : 'showChanges', { version: version.version })}
          onClick={onToggle}
        >
          {t('changes')}
        </Button>
        {canRollBack && !version.isLive && (
          <Button
            variant="secondary"
            size="sm"
            aria-label={t('rollback.open', { version: version.version })}
            onClick={onRollback}
          >
            {t('rollback.label')}
          </Button>
        )}
      </div>
      {isExpanded && (
        <div id={diffId}>
          <VersionDiff
            orgId={orgId}
            agentId={agentId}
            versionId={version.id}
            previousId={previousId}
          />
        </div>
      )}
    </li>
  )
}
