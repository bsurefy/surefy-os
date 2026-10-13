// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useTranslations } from 'next-intl'

import type { TestAgentToolDto } from '@surefy/contracts'
import { CodeBlock, StatusPill } from '@surefy/ui/components/DataDisplay'

const PREVIEW_MAX_HEIGHT = 240

interface TestResultProps {
  result: TestAgentToolDto
}

/** What the test call got: the status and time, the reason it failed, and the start of the answer. */
export default function TestResult({ result }: Readonly<TestResultProps>) {
  const t = useTranslations('agents.editor.tools.apiDialog.test')
  const tErrors = useTranslations('errors')
  const { ok, statusCode, latencyMs, reasonCode, responsePreview, truncated } = result

  return (
    <div className="flex flex-col gap-2" role="status">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone={ok ? 'success' : 'destructive'} label={ok ? t('passed') : t('failed')} />
        <span className="text-caption text-muted-foreground">
          {[
            statusCode === null ? null : t('status', { code: statusCode }),
            latencyMs === null ? null : t('latency', { ms: latencyMs }),
          ]
            .filter((part) => part !== null)
            .join(' · ')}
        </span>
      </div>
      {reasonCode !== null && (
        <p className="text-body text-foreground">
          {tErrors.has(reasonCode) ? tErrors(reasonCode) : tErrors('fallback')}
        </p>
      )}
      {responsePreview !== null && (
        <>
          <CodeBlock
            code={responsePreview}
            language="json"
            labels={{ copy: t('copy'), copied: t('copied') }}
            maxHeight={PREVIEW_MAX_HEIGHT}
          />
          {truncated && <p className="text-caption text-muted-foreground">{t('truncated')}</p>}
        </>
      )}
    </div>
  )
}
