// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useTranslations } from 'next-intl'
import { memo, useEffect, useRef } from 'react'

import { Markdown } from '@surefy/ui/components/DataDisplay'

import { getCitationIndex, linkCitations } from '../../ChatThread.utils'

import type { ThreadSource } from '../../ChatThread.types'

const CHIP =
  '[&_a[href^="#source-"]]:bg-surface-2 [&_a[href^="#source-"]]:text-foreground [&_a[href^="#source-"]]:text-caption [&_a[href^="#source-"]]:mx-0.5 [&_a[href^="#source-"]]:rounded-full [&_a[href^="#source-"]]:px-1.5 [&_a[href^="#source-"]]:py-0.5 [&_a[href^="#source-"]]:no-underline [&_a[href^="#source-"]]:hover:bg-border'

/**
 * An answer's text as Markdown. Citation markers `[n]` become numbered chips that open the source
 * preview instead of a new tab; code blocks keep their copy button.
 */
function AnswerText({
  text,
  sources,
  onOpenSource,
}: Readonly<{
  text: string
  sources: readonly ThreadSource[]
  onOpenSource: (index: number) => void
}>) {
  const t = useTranslations('chat.thread.answer')
  // the handler changes every render; the rendered Markdown must not
  const latest = useRef(onOpenSource)
  useEffect(() => {
    latest.current = onOpenSource
  })
  return (
    // the chips are links inside Markdown, so one handler on the wrapper catches their clicks

    <div
      className={CHIP}
      onClick={(event) => {
        const link = (event.target as HTMLElement).closest('a')
        const index = getCitationIndex(link?.getAttribute('href'))
        if (index !== null) {
          event.preventDefault()
          latest.current(index)
        }
      }}
    >
      <Markdown codeLabels={{ copy: t('copyCode'), copied: t('copiedCode') }}>
        {linkCitations(text, sources)}
      </Markdown>
    </div>
  )
}

const sameSources = (a: readonly ThreadSource[], b: readonly ThreadSource[]) =>
  a.length === b.length &&
  a.every(
    (source, position) =>
      source.index === b.at(position)?.index && source.title === b.at(position)?.title,
  )

/**
 * The shared Markdown component builds its element types on every render, which remounts the
 * whole answer; memoizing on the text and the sources keeps the DOM (and the reader's selection and
 * clicks) steady while the rest of the thread updates.
 */
export default memo(
  AnswerText,
  (before, after) => before.text === after.text && sameSources(before.sources, after.sources),
)
