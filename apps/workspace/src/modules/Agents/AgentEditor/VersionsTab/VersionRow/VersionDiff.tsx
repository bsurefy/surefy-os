// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { agentQueries } from '@/api/agents'
import { diffAgentDefinitions } from '@surefy/contracts'
import { SkeletonText } from '@surefy/ui/components/Feedback'
import { Button } from '@surefy/ui/primitives/button'

import AgentChangeList from '../../AgentChangeList'

/** What a version changed from the one before it, worked out from the two definitions. */
export default function VersionDiff({
  orgId,
  agentId,
  versionId,
  previousId,
}: Readonly<{ orgId: string; agentId: string; versionId: string; previousId: string | null }>) {
  const t = useTranslations('agents.editor.versions')
  const current = useQuery(agentQueries.versionDetail(orgId, agentId, versionId))
  const previous = useQuery({
    ...agentQueries.versionDetail(orgId, agentId, previousId ?? ''),
    enabled: previousId !== null,
  })

  if (current.error || previous.error) {
    return (
      <p role="alert" className="text-body text-destructive flex flex-wrap items-center gap-2">
        {t('changesError')}
        <Button
          variant="link"
          size="sm"
          onClick={() => {
            void current.refetch()
            void previous.refetch()
          }}
        >
          {t('retry')}
        </Button>
      </p>
    )
  }
  if (!current.data || (previousId !== null && !previous.data)) return <SkeletonText lines={2} />
  if (previousId === null || !previous.data) return <p className="text-body">{t('firstVersion')}</p>

  const changes = diffAgentDefinitions(previous.data.definition, current.data.definition)
  if (changes.length === 0) return <p className="text-body">{t('noChanges')}</p>
  return <AgentChangeList changes={changes} />
}
