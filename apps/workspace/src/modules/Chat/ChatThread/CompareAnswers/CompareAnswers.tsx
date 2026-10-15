// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useFormatter, useTranslations } from 'next-intl'

import { Button } from '@surefy/ui/primitives/button'

import { MICROS_PER_UNIT } from '../ChatThread.constants'

import type { ThreadMessage } from '../ChatThread.types'
import type { ReactNode } from 'react'

export interface CompareColumn {
  row: ThreadMessage
  modelName: string | null
  /** The answer, drawn like any other answer. */
  content: ReactNode
}

export interface CompareAnswersProps {
  a: CompareColumn
  b: CompareColumn
  /** An answer is still streaming, or the choice is being saved. */
  isBusy: boolean
  onChoose: (messageId: string) => void
}

/** Time, tokens and cost of one answer: the figures that tell the two models apart. */
function Stats({ row }: Readonly<{ row: ThreadMessage }>) {
  const t = useTranslations('chat.thread.compare')
  const format = useFormatter()
  const { usage } = row
  if (!usage) return null
  const figures = [
    t('time', { seconds: format.number(usage.latencyMs / 1000, { maximumFractionDigits: 1 }) }),
    t('tokens', {
      input: format.number(usage.inputTokens),
      output: format.number(usage.outputTokens),
    }),
    format.number(usage.costMicros / MICROS_PER_UNIT, {
      style: 'currency',
      currency: usage.currency,
      maximumFractionDigits: 4,
    }),
  ]
  return <p className="text-caption text-muted-foreground">{figures.join(' · ')}</p>
}

function Column({
  column,
  label,
  canChoose,
  onChoose,
}: Readonly<{
  column: CompareColumn
  label: 'a' | 'b'
  canChoose: boolean
  onChoose: (messageId: string) => void
}>) {
  const t = useTranslations('chat.thread.compare')
  const letter = label.toUpperCase()
  return (
    <section
      aria-label={t('answer', { label: letter })}
      className="border-border bg-surface flex min-w-0 flex-col gap-3 rounded-xl border p-4"
    >
      <header className="flex flex-col gap-0.5">
        <span className="text-overline text-muted-foreground uppercase">
          {t('answer', { label: letter })}
        </span>
        <Stats row={column.row} />
      </header>
      {column.content}
      <Button
        variant="secondary"
        size="sm"
        className="mt-auto self-start"
        disabled={!canChoose}
        onClick={() => {
          onChoose(column.row.id)
        }}
      >
        {t('continueWith', { label: letter })}
      </Button>
    </section>
  )
}

/**
 * Two answers to one message side by side (chat.md §2): each with its model, time, tokens and cost,
 * and "Continue with A/B", which keeps that answer and the chat goes on with its model. The choice
 * opens once both are stored.
 */
export default function CompareAnswers({ a, b, isBusy, onChoose }: Readonly<CompareAnswersProps>) {
  const t = useTranslations('chat.thread.compare')
  const canChoose = !isBusy && a.row.isPersisted && b.row.isPersisted
  return (
    <div role="group" aria-label={t('label')} className="flex flex-col gap-3">
      <div className="grid gap-4 md:grid-cols-2">
        <Column column={a} label="a" canChoose={canChoose} onChoose={onChoose} />
        <Column column={b} label="b" canChoose={canChoose} onChoose={onChoose} />
      </div>
      <p className="text-caption text-muted-foreground">{t('hint')}</p>
    </div>
  )
}
