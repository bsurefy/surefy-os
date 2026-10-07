// SPDX-License-Identifier: AGPL-3.0-only
'use no memo'

import { useState } from 'react'

import { useUpdateChatMutation } from '@/api/chats'
import type { ChatDto, ChatKnowledgeScope, UsableModelDto } from '@surefy/contracts'

export interface ThreadSettings {
  /** Null until the models load and no choice was made. */
  modelKey: string | null
  knowledgeScope: ChatKnowledgeScope
  knowledgeBaseIds: string[]
  isPrivate: boolean
}

export const DEFAULT_SETTINGS: ThreadSettings = {
  modelKey: null,
  knowledgeScope: 'all',
  knowledgeBaseIds: [],
  isPrivate: false,
}

const fromChat = (chat: ChatDto | null): ThreadSettings =>
  chat
    ? {
        modelKey: chat.currentModelKey,
        knowledgeScope: chat.knowledgeScope,
        knowledgeBaseIds: chat.knowledgeBaseIds,
        isPrivate: chat.isPrivate,
      }
    : DEFAULT_SETTINGS

/** Local models answer a private chat and keep data on the server. */
export const isLocalModel = (model: Pick<UsableModelDto, 'dataLocation'> | undefined): boolean =>
  model?.dataLocation === 'on_server'

/**
 * What the next message uses: the model, the knowledge it may search and whether the chat is
 * private. A saved chat keeps them on the server; a new chat sends them with its first message.
 * Moving a conversation from a local model to a cloud one asks first.
 */
export function useThreadSettings({
  orgId,
  chat,
  chatId,
  models,
  hasMessages,
}: {
  orgId: string
  chat: ChatDto | null
  chatId: string
  models: readonly UsableModelDto[]
  hasMessages: boolean
}) {
  const update = useUpdateChatMutation(orgId)
  const [settings, setSettings] = useState<ThreadSettings>(() => fromChat(chat))
  const [pendingModelKey, setPendingModelKey] = useState<string | null>(null)

  const modelKey = settings.modelKey ?? models[0]?.modelKey ?? null
  const current = models.find((model) => model.modelKey === modelKey)
  const firstLocal = models.find((model) => isLocalModel(model))

  const save = (changes: Partial<ThreadSettings>) => {
    setSettings((value) => ({ ...value, ...changes }))
    if (chat) {
      update.mutate({
        chatId,
        ...(changes.modelKey ? { currentModelKey: changes.modelKey } : {}),
        ...(changes.knowledgeScope
          ? { knowledgeScope: changes.knowledgeScope, knowledgeBaseIds: changes.knowledgeBaseIds }
          : {}),
        ...(changes.isPrivate === undefined ? {} : { isPrivate: changes.isPrivate }),
      })
    }
  }

  return {
    settings: { ...settings, modelKey },
    currentModel: current,
    /** Private chats need an enabled local model. */
    canBePrivate: firstLocal !== undefined,
    firstLocalModelKey: firstLocal?.modelKey ?? null,
    pendingModel: models.find((model) => model.modelKey === pendingModelKey),
    onModelChange: (key: string) => {
      const next = models.find((model) => model.modelKey === key)
      if (hasMessages && isLocalModel(current) && next && !isLocalModel(next)) {
        setPendingModelKey(key)
        return
      }
      save({ modelKey: key })
    },
    onConfirmModelChange: () => {
      if (pendingModelKey) save({ modelKey: pendingModelKey })
      setPendingModelKey(null)
    },
    onCancelModelChange: () => {
      setPendingModelKey(null)
    },
    onScopeChange: (knowledgeScope: ChatKnowledgeScope, knowledgeBaseIds: string[]) => {
      save({ knowledgeScope, knowledgeBaseIds })
    },
    onPrivateChange: (isPrivate: boolean) => {
      // a private chat can only use local models, so it moves to one
      save({
        isPrivate,
        ...(isPrivate && !isLocalModel(current) && firstLocal
          ? { modelKey: firstLocal.modelKey }
          : {}),
      })
    },
  }
}
export type ThreadSettingsController = ReturnType<typeof useThreadSettings>
