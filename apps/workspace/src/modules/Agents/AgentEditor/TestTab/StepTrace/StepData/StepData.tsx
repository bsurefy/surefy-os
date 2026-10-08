// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { agentRunQueries } from '@/api/agentRuns'
import type { AgentRunStepData } from '@surefy/contracts'
import { CodeBlock } from '@surefy/ui/components/DataDisplay'
import { ErrorState, SkeletonRows } from '@surefy/ui/components/Feedback'
import { getErrorMessage } from '@surefy/web-core/errors'

interface StepDataProps {
  orgId: string
  runId: string
  seq: number
}

function DataBlock({ label, data }: Readonly<{ label: string; data: AgentRunStepData | null }>) {
  const t = useTranslations('agents.editor.test.step')
  if (data === null) return null
  return (
    <div className="flex flex-col gap-1.5">
      <h5 className="text-label text-foreground-secondary">{label}</h5>
      <CodeBlock
        code={JSON.stringify(data, null, 2)}
        language="json"
        labels={{ copy: t('copy'), copied: t('copied') }}
        maxHeight={240}
      />
      {data.truncated && <p className="text-caption text-muted-foreground">{t('truncated')}</p>}
    </div>
  )
}

/** The input and output of one step, read when the step is opened. */
export default function StepData({ orgId, runId, seq }: Readonly<StepDataProps>) {
  const t = useTranslations('agents.editor.test.step')
  const tErrors = useTranslations('errors')
  const step = useQuery(agentRunQueries.step(orgId, runId, seq))

  if (step.isPending) return <SkeletonRows rows={2} />
  if (step.error) {
    return (
      <ErrorState
        title={t('loadError')}
        message={getErrorMessage(step.error, tErrors)}
        onRetry={() => void step.refetch()}
      />
    )
  }
  const { input, output } = step.data
  if (input === null && output === null) {
    return <p className="text-body text-muted-foreground">{t('noData')}</p>
  }
  return (
    <div className="flex flex-col gap-3">
      <DataBlock label={t('input')} data={input} />
      <DataBlock label={t('output')} data={output} />
    </div>
  )
}
