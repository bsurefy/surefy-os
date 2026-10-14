// SPDX-License-Identifier: AGPL-3.0-only
'use no memo'

import { useInfiniteQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { agentQueries } from '@/api/agents'
import { useClearChatFeedbackMutation, useSetChatFeedbackMutation } from '@/api/chats'
import { modelQueries } from '@/api/models'
import { ROUTES } from '@/constants/routes'
import { getProviderName } from '@/modules/Vault'
import { toRoute } from '@/modules/Workspace'
import type { ChatDto, ChatMessageDto } from '@surefy/contracts'
import { PERMISSIONS } from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'
import { useCan } from '@surefy/web-core/access'

import { useChatActions } from '../../ChatList/ChatList.hooks'
import { AGENT_UNAVAILABLE_ERRORS, USABLE_AGENTS_LIMIT } from '../ChatThread.constants'
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
  /** The agent a new chat will talk to (`?agent=`); null for a model chat. */
  agentId: string | null
  onAgentChange: (agentId: string | null) => void
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
  const router = useRouter()
  const isOnline = useIsOnline()
  const canManageVault = useCan(PERMISSIONS.VAULT_MANAGE)
  const canUseAgents = useCan(PERMISSIONS.AGENTS_INVOKE)
  const modelsQuery = useInfiniteQuery(
    modelQueries.usable(orgId, { type: 'chat', limit: MODELS_LIMIT }),
  )
  const models = modelsQuery.data?.pages.flatMap((page) => page.items) ?? []
  const agentsQuery = useInfiniteQuery({
    ...agentQueries.usable(orgId, { limit: USABLE_AGENTS_LIMIT }),
    enabled: canUseAgents,
  })
  const usableAgents = agentsQuery.data?.pages.flatMap((page) => page.items) ?? []
  // an agent chat talks to its agent for good; a new chat picks one from the URL
  const agentRef = chat?.agent ?? null
  const agentId = agentRef?.id ?? (isNew ? props.agentId : null)
  const usableAgent = usableAgents.find((candidate) => candidate.id === agentId)
  const isAgentChat = agentId !== null
  const chatActions = useChatActions(orgId, orgSlug, chatId)
  const attachments = useAttachments(orgId, chatId)
  const [text, setText] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isExportOpen, setIsExportOpen] = useState(false)
  const [isRenameOpen, setIsRenameOpen] = useState(false)
  const [isShareOpen, setIsShareOpen] = useState(false)
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
    // the agent's own model answers an agent chat
    modelKey: isAgentChat ? null : settings.settings.modelKey,
    newChat: isAgentChat
      ? { agentId }
      : {
          isPrivate: settings.settings.isPrivate,
          knowledgeScope: settings.settings.knowledgeScope,
          knowledgeBaseIds: settings.settings.knowledgeBaseIds,
        },
    lastAnswerModelKey: isAgentChat ? null : lastModelOf(history),
  })

  // paused, archived or no longer shared: the history stays, read only
  const isAgentGone =
    agentRef?.isAvailable === false ||
    (isNew && isAgentChat && agentsQuery.isSuccess && usableAgent === undefined) ||
    (isAgentChat && AGENT_UNAVAILABLE_ERRORS.includes(stream.errorCode ?? ''))
  const agent = isAgentChat
    ? {
        id: agentId,
        name: agentRef?.name ?? usableAgent?.name ?? null,
        description: usableAgent?.description ?? null,
        conversationStarters: usableAgent?.conversationStarters ?? [],
        isGone: isAgentGone,
      }
    : null

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
  const lastRow = rows.at(-1)
  // an agent answer whose run waits for an approval: the next message waits too
  const isWaitingForRun =
    isIdle && lastRow?.role === 'assistant' && lastRow.status === 'streaming' && lastRow.isPersisted
  const canAnswer = agent ? agent.name !== null && !agent.isGone : hasModels === true
  const canSend =
    isOnline &&
    isIdle &&
    !isWaitingForRun &&
    canAnswer &&
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
    agent,
    isWaitingForRun,
    picker: {
      agents: usableAgents,
      canUseAgents,
      isModelsPending: modelsQuery.isPending,
      /** An agent chat that exists cannot change its agent. */
      isAgentLocked: chat !== null && agentRef !== null,
      onModelSelect: (modelKey: string) => {
        if (isNew && isAgentChat) props.onAgentChange(null)
        settings.onModelChange(modelKey)
      },
      onAgentSelect: (id: string) => {
        if (isNew) props.onAgentChange(id)
        // a model chat that exists stays as it is: the agent starts a new chat
        else router.push(toRoute(`${ROUTES.workspace.chat(orgSlug)}?agent=${id}`))
      },
    },
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
    chatActions,
    onDeleteChat: () => {
      if (chat) chatActions.onDelete(chat)
    },
    shareDialog: {
      isOpen: isShareOpen,
      onOpen: () => {
        setIsShareOpen(true)
      },
      onClose: () => {
        setIsShareOpen(false)
      },
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
