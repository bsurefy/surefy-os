// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Check, Copy, RefreshCw, ThumbsDown, ThumbsUp } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { BrandMark, DataLocationBadge, Markdown } from '@surefy/ui/components/DataDisplay'
import { Spinner } from '@surefy/ui/components/Feedback'
import { Button } from '@surefy/ui/primitives/button'

import AnswerText from '../AnswerText'
import FailureCard from '../FailureCard'
import SourcesList from '../SourcesList'

import type { ThreadMessage, ThreadNote } from '../../ChatThread.types'
import type { FailureCardProps } from '../FailureCard'

export interface AssistantMessageProps {
  row: ThreadMessage
  /** The name and provider of the model that answered, from the usable models. */
  modelName: string | null
  providerName: string | null
  isLocal: boolean
  isLast: boolean
  isBusy: boolean
  failure: Omit<FailureCardProps, 'code' | 'isRetryable' | 'onRetry' | 'modelName'>
  onOpenSource: (index: number) => void
  onCopy: () => void
  onRegenerate: () => void
  onContinue: () => void
  onRate: (rating: 'helpful' | 'not_helpful') => void
}

type AnswerTranslator = ReturnType<typeof useTranslations<'chat.thread.answer'>>

function reasoningLabel(
  part: { isStreaming: boolean; durationMs?: number },
  t: AnswerTranslator,
): string {
  if (part.isStreaming) return t('thinking')
  if (part.durationMs === undefined) return t('reasoning')
  return t('reasoningFor', { seconds: Math.max(1, Math.round(part.durationMs / 1000)) })
}

function Notes({ notes }: Readonly<{ notes: readonly ThreadNote[] }>) {
  const t = useTranslations('chat.thread.notes')
  return (
    <>
      {notes.map((note) => {
        if (note.name === 'sources-processing') {
          return (
            <p key={note.name} className="text-caption text-muted-foreground">
              {t('processing', { count: note.count })}
            </p>
          )
        }
        if (note.name === 'knowledge-skipped') {
          return (
            <p key={note.name} className="text-caption text-muted-foreground">
              {t(`skipped.${note.reason}`)}
            </p>
          )
        }
        return null
      })}
    </>
  )
}

/**
 * An answer: the model that gave it and where the data went, collapsed reasoning and tool steps,
 * the text with citation chips, its sources, the notes the server added, and the actions.
 */
export default function AssistantMessage({
  row,
  modelName,
  providerName,
  isLocal,
  isLast,
  isBusy,
  failure,
  onOpenSource,
  onCopy,
  onRegenerate,
  onContinue,
  onRate,
}: Readonly<AssistantMessageProps>) {
  const t = useTranslations('chat.thread.answer')
  const text = row.parts.filter((part) => part.kind === 'text')
  const reasoning = row.parts.filter((part) => part.kind === 'reasoning')
  const tools = row.parts.filter((part) => part.kind === 'tool')
  const isStreaming = row.status === 'streaming'
  const hasContent = text.some((part) => part.text.length > 0) || reasoning.length > 0
  const isStopped = row.status === 'stopped'
  const isInterrupted = row.status === 'interrupted'
  const isFailed = row.status === 'failed'
  const canAct = !isStreaming && !isFailed && row.isPersisted
  const budgetNote = row.notes.find((note) => note.name === 'budget-reached')

  return (
    <article aria-label={t('label')} className="flex flex-col gap-3">
      {(modelName ?? row.dataLocation) && (
        <div className="text-caption text-muted-foreground flex flex-wrap items-center gap-2">
          <BrandMark size={22} />
          {modelName && (
            <span className="text-label text-foreground font-semibold">{modelName}</span>
          )}
          {row.dataLocation && (
            <DataLocationBadge
              location={isLocal ? 'local' : 'provider'}
              label={
                isLocal
                  ? t('location.local')
                  : t('location.provider', { provider: providerName ?? '' })
              }
            />
          )}
          {row.piiMasked && <span>{t('piiMasked')}</span>}
        </div>
      )}
      {isStreaming && !hasContent && (
        <p role="status" className="text-body text-muted-foreground flex items-center gap-2">
          <Spinner size="sm" />
          {t('thinking')}
        </p>
      )}
      {reasoning.map((part, position) => (
        <details
          key={`reasoning-${String(position)}`}
          className="text-caption text-muted-foreground"
        >
          <summary className="cursor-pointer">{reasoningLabel(part, t)}</summary>
          <Markdown
            tone="muted"
            codeLabels={{ copy: t('copyCode'), copied: t('copiedCode') }}
            className="border-border mt-2 border-l-2 pl-3"
          >
            {part.text}
          </Markdown>
        </details>
      ))}
      {tools.length > 0 && (
        <details className="text-caption text-muted-foreground">
          <summary className="cursor-pointer">{t('steps', { count: tools.length })}</summary>
          <ul className="mt-1 flex flex-col gap-0.5">
            {tools.map((tool) => (
              <li key={tool.toolCallId}>
                {tool.toolName} · {t(`toolState.${tool.state}`)}
              </li>
            ))}
          </ul>
        </details>
      )}
      {text.map((part, position) => (
        <AnswerText
          key={`text-${String(position)}`}
          text={part.text}
          sources={row.sources}
          onOpenSource={onOpenSource}
        />
      ))}
      <SourcesList sources={row.sources} onOpenSource={onOpenSource} />
      <Notes notes={row.notes} />
      {(isStopped || row.notes.some((note) => note.name === 'stopped')) && (
        <p className="text-caption text-muted-foreground flex items-center gap-2">
          {t('stopped')}
          {isLast && !isBusy && (
            <Button variant="link" size="sm" onClick={onContinue}>
              {t('continue')}
            </Button>
          )}
        </p>
      )}
      {isInterrupted && (
        <p className="text-caption text-destructive flex items-center gap-2" role="alert">
          {t('interrupted')}
          {isLast && !isBusy && (
            <Button variant="link" size="sm" onClick={onRegenerate}>
              {t('retry')}
            </Button>
          )}
        </p>
      )}
      {(isFailed || budgetNote) && (
        <FailureCard
          {...failure}
          code={isFailed ? row.errorCode : 'BUDGET_EXCEEDED'}
          modelName={modelName}
          isRetryable={isLast && !isBusy && isFailed}
          onRetry={onRegenerate}
        />
      )}
      {canAct && (
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label={t('actions')}>
          <Button
            variant="ghost"
            size="sm"
            aria-label={t('copy')}
            className="text-muted-foreground"
            onClick={onCopy}
          >
            <Copy aria-hidden />
            {t('copyShort')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label={t('regenerate')}
            className="text-muted-foreground"
            disabled={isBusy}
            onClick={onRegenerate}
          >
            <RefreshCw aria-hidden />
            {t('regenerateShort')}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('helpful')}
            aria-pressed={row.feedback?.rating === 'helpful'}
            onClick={() => {
              onRate('helpful')
            }}
          >
            {row.feedback?.rating === 'helpful' ? <Check aria-hidden /> : <ThumbsUp aria-hidden />}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('notHelpful')}
            aria-pressed={row.feedback?.rating === 'not_helpful'}
            onClick={() => {
              onRate('not_helpful')
            }}
          >
            <ThumbsDown aria-hidden />
          </Button>
          {row.sources.length > 0 && (
            <span className="text-caption text-muted-foreground ml-1">
              {t('answeredFrom', { count: row.sources.length })}
            </span>
          )}
        </div>
      )}
    </article>
  )
}
