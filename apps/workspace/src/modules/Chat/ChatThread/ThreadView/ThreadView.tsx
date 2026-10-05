// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useTranslations } from 'next-intl'

import { ConfirmDialog } from '@surefy/ui/components/Overlay'

import ChatExportDialog from '../../ChatList/ChatExportDialog'
import Composer from '../Composer'
import EmptyThread from '../EmptyThread'
import FeedbackDialog from '../FeedbackDialog'
import MessageList from '../MessageList'
import SourcePreview from '../SourcePreview'
import ThreadHeader from '../ThreadHeader'
import { useThreadViewController } from './ThreadView.controller'

import type { ThreadViewProps } from './ThreadView.controller'

/**
 * One conversation, or a new one (chat.md §1): the header, the messages or the empty state, the
 * composer, and the dialogs and sheets the thread opens.
 */
export default function ThreadView(props: Readonly<ThreadViewProps>) {
  const c = useThreadViewController(props)
  const t = useTranslations('chat.thread')
  const pending = c.settings.pendingModel

  return (
    <div className="flex min-h-[calc(100dvh-10rem)] flex-col gap-3">
      <ThreadHeader c={c} />
      <div className="flex-1">
        {c.isEmpty ? (
          <EmptyThread
            orgSlug={c.orgSlug}
            hasModels={c.hasModels}
            canManageVault={c.canManageVault}
            onSuggestion={(key) => {
              c.composer.onSuggestion(t(`empty.cards.${key}.prompt`))
            }}
          />
        ) : (
          <MessageList c={c} />
        )}
      </div>
      <div className="bg-background sticky bottom-0 mx-auto w-full max-w-[760px] pb-3">
        <Composer c={c} />
      </div>
      <ConfirmDialog
        open={pending !== undefined}
        onOpenChange={(open) => {
          if (!open) c.settings.onCancelModelChange()
        }}
        tier="T2"
        title={t('modelWarning.title', { model: pending?.displayName ?? '' })}
        description={t('modelWarning.description', {
          provider: c.modelInfo(pending?.modelKey ?? null).providerName ?? '',
        })}
        labels={{ confirm: t('modelWarning.confirm') }}
        onConfirm={c.settings.onConfirmModelChange}
      />
      {c.preview.target && (
        <SourcePreview
          orgId={c.orgId}
          orgSlug={c.orgSlug}
          chatId={c.chatId}
          target={c.preview.target}
          onClose={c.preview.onClose}
        />
      )}
      {c.feedback.forMessageId && (
        <FeedbackDialog
          isPending={c.feedback.isPending}
          onSubmit={c.feedback.onSubmit}
          onClose={c.feedback.onClose}
        />
      )}
      {c.exportDialog.isOpen && (
        <ChatExportDialog orgId={c.orgId} chatId={c.chatId} onClose={c.exportDialog.onClose} />
      )}
    </div>
  )
}
