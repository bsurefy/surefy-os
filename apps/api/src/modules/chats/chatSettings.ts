// SPDX-License-Identifier: AGPL-3.0-only
import { ModelNotAllowedError } from '@/modules/modelGateway/index.js'
import type { ChatSettingsInput } from '@surefy/contracts'

import { ChatFolderNotFoundError, ChatPrivateRequiresLocalModelError } from './chats.errors.js'

import type { ChatPatch, ChatsRepository } from './chats.repository.js'
import type { ChatModelInfo, ChatModels } from './chats.types.js'
import type { DbExecutor } from '@/core/database/index.js'
import type { TenantContext } from '@/types/context.js'

export interface ChatSettingsDeps {
  repository: ChatsRepository
  models: ChatModels
}

/** What a chat currently is, when the settings change an existing one. */
export interface CurrentChatSettings {
  isPrivate: boolean
  knowledgeScope: string
}

export interface ResolvedSettings {
  patch: ChatPatch
  /** Set when the selected knowledge bases change. */
  knowledgeBaseIds?: string[]
  /** The chat turned private: its feedback leaves Train. */
  turnedPrivate: boolean
}

/**
 * The model for a call must exist, be enabled and be allowed to the person; a private chat takes
 * local models only. Whether its provider can serve it is the gateway's call.
 */
export async function assertModelUsable(
  deps: ChatSettingsDeps,
  tx: DbExecutor,
  ctx: TenantContext,
  modelKey: string,
  options: { isPrivate: boolean },
): Promise<ChatModelInfo> {
  const model = await deps.models.find(tx, ctx.orgId, modelKey)
  const allowed = ctx.access.allowedModelIds
  if (model?.isEnabled !== true || (allowed !== 'all' && !allowed.includes(model.id))) {
    throw new ModelNotAllowedError()
  }
  if (options.isPrivate && model.source !== 'local') throw new ChatPrivateRequiresLocalModelError()
  return model
}

/** The knowledge selection a settings change leaves: undefined when it does not touch it. */
function knowledgeSelection(
  input: ChatSettingsInput,
  current: CurrentChatSettings | null,
): string[] | undefined {
  const scope = input.knowledgeScope ?? current?.knowledgeScope
  if (scope === 'selected') return input.knowledgeBaseIds
  return input.knowledgeScope === undefined ? undefined : []
}

/** Turning a chat private needs an enabled local model the person may use. */
async function assertLocalModelExists(
  deps: ChatSettingsDeps,
  tx: DbExecutor,
  ctx: TenantContext,
): Promise<void> {
  const local = await deps.models.firstUsable(tx, ctx.orgId, ctx.access.allowedModelIds, {
    localOnly: true,
  })
  if (local === undefined) throw new ChatPrivateRequiresLocalModelError()
}

/**
 * Validates the folder, privacy and knowledge scope a person sets on a chat and turns them into
 * the columns to write. Used when a chat is created with its first message and by `PATCH`.
 */
export async function resolveSettings(
  deps: ChatSettingsDeps,
  tx: DbExecutor,
  ctx: TenantContext,
  userId: string,
  input: ChatSettingsInput,
  current: CurrentChatSettings | null,
): Promise<ResolvedSettings> {
  const patch: ChatPatch = {}
  if (input.folderId !== undefined) {
    if (input.folderId !== null) {
      const folder = await deps.repository.findFolder(tx, ctx.orgId, userId, input.folderId)
      if (folder === undefined) throw new ChatFolderNotFoundError()
    }
    patch.folderId = input.folderId
  }
  const turnedPrivate = input.isPrivate === true && current?.isPrivate !== true
  if (turnedPrivate) await assertLocalModelExists(deps, tx, ctx)
  if (input.isPrivate !== undefined) patch.isPrivate = input.isPrivate
  if (input.knowledgeScope !== undefined) patch.knowledgeScope = input.knowledgeScope
  const knowledgeBaseIds = knowledgeSelection(input, current)
  return {
    patch,
    turnedPrivate,
    ...(knowledgeBaseIds === undefined ? {} : { knowledgeBaseIds }),
  }
}
