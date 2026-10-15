// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { ArrowDown } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@surefy/ui/primitives/button'

import CompareAnswers from '../CompareAnswers'
import AssistantMessage from '../Messages/AssistantMessage'
import UserMessage from '../Messages/UserMessage'
import ModelSwitchDivider from '../ModelSwitchDivider'

import type { ThreadMessage } from '../ChatThread.types'
import type { ThreadViewController } from '../ThreadView/ThreadView.controller'

/** The marker after the last message the thread keeps in view. */
function FollowAnchor({
  onElement,
}: Readonly<{ onElement: (element: HTMLDivElement | null) => void }>) {
  return <div ref={onElement} />
}

/**
 * The conversation, centered at 760px: the person's messages and the answers in order, with the
 * "Switched to {model}" dividers, and a way back down while an answer streams out of view.
 */
export default function MessageList({ c }: Readonly<{ c: ThreadViewController }>) {
  const t = useTranslations('chat.thread')
  const lastIndex = c.rows.length - 1
  const isBusy = c.activity !== 'idle'

  const renderAnswer = (row: ThreadMessage, options: { isLast: boolean; isReadOnly: boolean }) => {
    const info = c.modelInfo(row.modelKey)
    // an agent answers under its own name, whichever model it runs on
    const answeredBy = c.agent?.name ?? info.name
    return (
      <AssistantMessage
        row={row}
        modelName={answeredBy}
        providerName={info.providerName}
        isLocal={info.isLocal}
        isLast={options.isLast}
        isBusy={isBusy}
        isReadOnly={options.isReadOnly}
        failure={{
          orgSlug: c.orgSlug,
          canManageVault: c.canManageVault,
          hasLocalModel: c.settings.firstLocalModelKey !== null,
          onUseLocalModel: () => {
            if (c.settings.firstLocalModelKey) {
              c.settings.onModelChange(c.settings.firstLocalModelKey)
            }
          },
        }}
        onOpenSource={(index) => {
          const source = row.sources.find((candidate) => candidate.index === index)
          c.preview.onOpen(row.id, source?.title ?? t('preview.untitled'), index)
        }}
        onCopy={() => {
          c.onCopy(row)
        }}
        onRegenerate={() => {
          c.stream.regenerate(row.id)
        }}
        onContinue={() => {
          c.stream.continueAnswer(row.id)
        }}
        onRate={(rating) => {
          c.feedback.onRate(row, rating)
        }}
      />
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6 py-4">
      {c.hasEarlier && (
        <Button
          variant="secondary"
          size="sm"
          className="self-center"
          isLoading={c.isLoadingEarlier}
          onClick={c.onLoadEarlier}
        >
          {t('loadEarlier')}
        </Button>
      )}
      {c.items.map((item) => {
        if (item.kind === 'comparison') {
          return (
            <CompareAnswers
              key={`${item.a.id}-${item.b.id}`}
              a={{
                row: item.a,
                modelName: c.modelInfo(item.a.modelKey).name,
                content: renderAnswer(item.a, { isLast: false, isReadOnly: true }),
              }}
              b={{
                row: item.b,
                modelName: c.modelInfo(item.b.modelKey).name,
                content: renderAnswer(item.b, { isLast: false, isReadOnly: true }),
              }}
              isBusy={isBusy || c.compare.isChoosing}
              onChoose={c.compare.onChoose}
            />
          )
        }
        const { row } = item
        const position = c.rows.indexOf(row)
        const switchPart = row.parts.find((part) => part.kind === 'switch')
        if (row.role === 'user') {
          return (
            <UserMessage
              key={row.id}
              row={row}
              isEditing={c.editing.id === row.id}
              canEdit={row.isPersisted && !isBusy}
              onEdit={() => {
                c.editing.onStart(row.id)
              }}
              onCancelEdit={c.editing.onCancel}
              onSaveEdit={(text) => {
                c.editing.onSave(row.id, text)
              }}
            />
          )
        }
        return (
          <div key={row.id} className="flex flex-col gap-6">
            {switchPart?.kind === 'switch' && (
              <ModelSwitchDivider
                modelName={c.modelInfo(switchPart.toModelKey).name ?? switchPart.toModelKey}
              />
            )}
            {renderAnswer(row, { isLast: position === lastIndex, isReadOnly: false })}
          </div>
        )
      })}
      {c.activity === 'submitted' && c.rows.at(-1)?.role === 'user' && (
        <p role="status" className="text-body text-muted-foreground">
          {t('answer.thinking')}
        </p>
      )}
      {c.errorCode !== null && !c.rows.some((row) => row.status === 'failed') && (
        <p role="alert" className="text-body text-destructive">
          {t('failure.generic.description')}
        </p>
      )}
      <FollowAnchor onElement={c.follow.setEnd} />
      {c.follow.isAway && isBusy && (
        <Button
          variant="secondary"
          size="sm"
          className="sticky bottom-24 self-center"
          onClick={c.follow.onJumpToLatest}
        >
          <ArrowDown aria-hidden />
          {t('jump')}
        </Button>
      )}
    </div>
  )
}
