// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { ArrowDown } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@surefy/ui/primitives/button'

import AssistantMessage from '../Messages/AssistantMessage'
import UserMessage from '../Messages/UserMessage'
import ModelSwitchDivider from '../ModelSwitchDivider'

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
      {c.rows.map((row, position) => {
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
        const info = c.modelInfo(row.modelKey)
        return (
          <div key={row.id} className="flex flex-col gap-6">
            {switchPart?.kind === 'switch' && (
              <ModelSwitchDivider
                modelName={c.modelInfo(switchPart.toModelKey).name ?? switchPart.toModelKey}
              />
            )}
            <AssistantMessage
              row={row}
              modelName={info.name}
              providerName={info.providerName}
              isLocal={info.isLocal}
              isLast={position === lastIndex}
              isBusy={isBusy}
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
