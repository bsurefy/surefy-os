// SPDX-License-Identifier: AGPL-3.0-only
'use no memo'

import { useInfiniteQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { useClearChatFeedbackMutation, useSetChatFeedbackMutation } from '@/api/chats'
import { modelQueries } from '@/api/models'
import { getProviderName } from '@/modules/Vault'
import type { ChatDto, ChatMessageDto } from '@surefy/contracts'
import { PERMISSIONS } from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'
import { useCan } from '@surefy/web-core/access'

import { useChatActions } from '../../ChatList/ChatList.hooks'
import { useFollowOutput, useIsOnline } from '../ChatThread.hooks'
import { buildRows, getMessageText } from '../ChatThread.utils'
import { isLocalModel, useThreadSettings } from './ThreadView.settings'
import { useThreadStream } from './ThreadView.stream'
import { useAttachments } from '../Composer/Composer.attachments'

import type { ThreadMessage } from '../ChatThread.types'
import type { SourcePreviewTarget } from '../SourcePreview'

const MODELS_LIMIT = 100

export interface ThreadViewProps {
  orgId: string
  orgSlug: string
  chatId: string
  isNew: boolean
  chat: ChatDto | null
  history: readonly ChatMessageDto[]
  hasEarlier: boolean
  isLoadingEarlier: boolean
  onLoadEarlier: () => void
  refetchHistory: () => Promise<readonly ChatMessageDto[] | null>
}

/** The answer of the signed-in person's last answered model, for the "Switched to" divider. */
const lastModelOf = (history: readonly ChatMessageDto[]): string | null =>
  history.findLast((message) => message.role === 'assistant' && message.modelKey)?.modelKey ?? null

/**
 * Everything the thread needs: the usable models, the settings of the next message, the live
 * stream, the composer's text and files, and what each message action does.
 */
export function useThreadViewController(props: ThreadViewProps) {
  const { orgId, orgSlug, chatId, isNew, chat, history } = props
  const t = useTranslations('chat.thread')
  const isOnline = useIsOnline()
  const canManageVault = useCan(PERMISSIONS.VAULT_MANAGE)
  const modelsQuery = useInfiniteQuery(
    modelQueries.usable(orgId, { type: 'chat', limit: MODELS_LIMIT }),
  )
  const models = modelsQuery.data?.pages.flatMap((page) => page.items) ?? []
  const chatActions = useChatActions(orgId, orgSlug, chatId)
  const attachments = useAttachments(orgId, chatId)
  const [text, setText] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isExportOpen, setIsExportOpen] = useState(false)
  const [isRenameOpen, setIsRenameOpen] = useState(false)
  const [preview, setPreview] = useState<SourcePreviewTarget | null>(null)
  const [feedbackFor, setFeedbackFor] = useState<string | null>(null)
  const setFeedback = useSetChatFeedbackMutation(orgId, chatId)
  const clearFeedback = useClearChatFeedbackMutation(orgId, chatId)

  const settings = useThreadSettings({
    orgId,
    chat,
    chatId,
    models,
    hasMessages: history.length > 0,
  })
  const stream = useThreadStream({
    orgId,
    orgSlug,
    chatId,
    isNew,
    history,
    refetchHistory: props.refetchHistory,
    modelKey: settings.settings.modelKey,
    newChat: {
      isPrivate: settings.settings.isPrivate,
      knowledgeScope: settings.settings.knowledgeScope,
      knowledgeBaseIds: settings.settings.knowledgeBaseIds,
    },
    lastAnswerModelKey: lastModelOf(history),
  })

  const baseRows = buildRows(stream.live, history, stream.activity !== 'idle', stream.stoppedId)
  const rows = baseRows.map((row, position): ThreadMessage => {
    const isLiveAnswer =
      position === baseRows.length - 1 && !row.isPersisted && row.role === 'assistant'
    return isLiveAnswer && stream.switchedFrom
      ? {
          ...row,
          parts: [
            {
              kind: 'switch',
              fromModelKey: stream.switchedFrom.from,
              toModelKey: stream.switchedFrom.to,
            },
            ...row.parts,
          ],
        }
      : row
  })
  const follow = useFollowOutput(rows)

  const trimmed = text.trim()
  const currentModel = settings.currentModel
  const isVisionBlocked =
    attachments.hasImages && currentModel !== undefined && !currentModel.supportsVision
  const hasModels = modelsQuery.isPending ? undefined : models.length > 0
  const isIdle = stream.activity === 'idle'
  const canSend =
    isOnline &&
    isIdle &&
    hasModels === true &&
    trimmed.length > 0 &&
    !attachments.hasUnfinished &&
    !isVisionBlocked

  const lastUserRow = rows.findLast((row) => row.role === 'user' && row.isPersisted)

  return {
    t,
    orgId,
    orgSlug,
    chatId,
    isNew,
    chat,
    rows,
    isEmpty: rows.length === 0 && stream.activity === 'idle',
    activity: stream.activity,
    errorCode: stream.errorCode,
    models,
    hasModels,
    canManageVault,
    settings,
    stream,
    attachments,
    follow,
    isOnline,
    composer: {
      text,
      onTextChange: setText,
      canSend,
      isVisionBlocked,
      onSend: () => {
        if (!canSend) return
        stream.send(trimmed, attachments.readyChips)
        setText('')
        attachments.clear()
      },
      onSuggestion: (prompt: string) => {
        setText(prompt)
      },
      /** ↑ in an empty composer edits the last message of the person. */
      onEditLast: () => {
        if (lastUserRow) setEditingId(lastUserRow.id)
      },
    },
    editing: {
      id: editingId,
      onStart: setEditingId,
      onCancel: () => {
        setEditingId(null)
      },
      onSave: (messageId: string, value: string) => {
        setEditingId(null)
        stream.edit(messageId, value)
      },
    },
    /** The name, provider and data location of the model that gave an answer. */
    modelInfo: (modelKey: string | null) => {
      const model = models.find((candidate) => candidate.modelKey === modelKey)
      return {
        name: model?.displayName ?? (modelKey ? (modelKey.split('/').at(-1) ?? modelKey) : null),
        providerName: model ? getProviderName(model.providerKey) : null,
        isLocal: model ? isLocalModel(model) : modelKey?.startsWith('local/') === true,
      }
    },
    preview: {
      target: preview,
      onOpen: (messageId: string, title: string, index: number) => {
        setPreview({ messageId, title, index })
      },
      onClose: () => {
        setPreview(null)
      },
    },
    feedback: {
      forMessageId: feedbackFor,
      isPending: setFeedback.isPending,
      onRate: (row: ThreadMessage, rating: 'helpful' | 'not_helpful') => {
        if (row.feedback?.rating === rating) clearFeedback.mutate(row.id)
        else if (rating === 'helpful') setFeedback.mutate({ messageId: row.id, rating })
        else setFeedbackFor(row.id)
      },
      onSubmit: (correction: string | undefined) => {
        if (feedbackFor) {
          setFeedback.mutate(
            { messageId: feedbackFor, rating: 'not_helpful', correctionText: correction },
            {
              onSuccess: () => {
                setFeedbackFor(null)
                toast.success(t('feedback.thanks'))
              },
            },
          )
        }
      },
      onClose: () => {
        setFeedbackFor(null)
      },
    },
    onCopy: (row: ThreadMessage) => {
      void navigator.clipboard.writeText(getMessageText(row)).then(() => {
        toast.success(t('actions.copied'))
      })
    },
    onDeleteChat: () => {
      if (chat) chatActions.onDelete(chat)
    },
    renameDialog: {
      isOpen: isRenameOpen,
      onOpen: () => {
        setIsRenameOpen(true)
      },
      onClose: () => {
        setIsRenameOpen(false)
      },
    },
    exportDialog: {
      isOpen: isExportOpen,
      onOpen: () => {
        setIsExportOpen(true)
      },
      onClose: () => {
        setIsExportOpen(false)
      },
    },
    hasEarlier: props.hasEarlier,
    isLoadingEarlier: props.isLoadingEarlier,
    onLoadEarlier: props.onLoadEarlier,
  }
}
export type ThreadViewController = ReturnType<typeof useThreadViewController>
