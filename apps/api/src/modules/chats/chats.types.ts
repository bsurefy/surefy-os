// SPDX-License-Identifier: AGPL-3.0-only
import type {
  AgentRunMessage,
  ChatAgentRefDto,
  ChatKnowledgeScope,
  ChatSourcePreviewDto,
  KnowledgeSkippedReason,
  SourcePart,
  UserRefDto,
} from '@surefy/contracts'

import type { DbExecutor } from '@/core/database/index.js'
import type { WebSearchOutcome } from '@/integrations/search/index.js'
import type { AuditRecorder } from '@/modules/audit/index.js'
import type {
  PiiFilterInput,
  PiiFilterResult,
  PiiRequestInput,
  PiiRequestResult,
} from '@/modules/guard/index.js'
import type { ModelGatewayService } from '@/modules/modelGateway/index.js'
import type { NotificationsService } from '@/modules/notifications/index.js'
import type { TenantContext } from '@/types/context.js'

/** The model fields a chat needs: whether a person may pick it, and whether it reads images. */
export interface ChatModelInfo {
  id: string
  modelKey: string
  displayName: string
  providerKey: string
  source: 'provider' | 'local' | 'trained'
  supportsVision: boolean
  isEnabled: boolean
  isAvailable: boolean
}

/** What chats read from the Vault's models (the modelGateway resolves keys; this only checks them). */
export interface ChatModels {
  find(tx: DbExecutor, orgId: string, modelKey: string): Promise<ChatModelInfo | undefined>
  /** The first enabled, available chat model the person may use; local ones only when asked. */
  firstUsable(
    tx: DbExecutor,
    orgId: string,
    allowedModelIds: readonly string[] | 'all',
    options: { localOnly: boolean },
  ): Promise<ChatModelInfo | undefined>
}

/** The AI calls a chat makes; always through the gateway. */
export type ChatGateway = Pick<ModelGatewayService, 'streamText' | 'generateText'>

/** The personal-data filter (guard module), applied before a request goes to a cloud model. */
export interface ChatPii {
  applyToRequest(input: PiiRequestInput): Promise<PiiRequestResult>
  apply(input: PiiFilterInput): Promise<PiiFilterResult>
}

/** A passage retrieved for a question; becomes a numbered `source` part and a citation. */
export interface RetrievedPassage {
  knowledgeBaseId: string
  documentId: string
  chunkId: string
  page: number | null
  title: string
  text: string
}

export interface ChatRetrievalRequest {
  ctx: TenantContext
  query: string
  scope: ChatKnowledgeScope
  /** The selection when `scope` is `selected`. */
  knowledgeBaseIds: readonly string[]
  /** "Local models only" bases are searched only when the answering model runs on the server. */
  answeringModelIsLocal: boolean
  signal?: AbortSignal
}

export interface ChatRetrievalResult {
  passages: RetrievedPassage[]
  /** Knowledge was in scope but nothing could be searched. */
  skipped: KnowledgeSkippedReason | null
  /** Sources still processing, which were not searched. */
  processingCount: number
}

/** Where a cited passage is checked again when its preview opens. */
export interface ChatSourceLookup {
  ctx: TenantContext
  source: SourcePart
}

export type ChatSourceCheck = Pick<
  ChatSourcePreviewDto,
  'status' | 'passage' | 'canOpenInKnowledge'
>

/**
 * Knowledge retrieval for answers with sources. The knowledge module implements it and the
 * container passes it in; a chats module built without one answers without sources.
 */
export interface ChatRetrieval {
  retrieve(request: ChatRetrievalRequest): Promise<ChatRetrievalResult>
  /** Re-checks the viewer's access to a cited knowledge source and reads its passage. */
  checkSource(lookup: ChatSourceLookup): Promise<ChatSourceCheck>
}

/** Web search for an answer (V1): the search integration after the access policy and Vault. */
export interface ChatWebSearch {
  /** A search provider is set up for the organization. */
  isConfigured(orgId: string): Promise<boolean>
  search(request: {
    ctx: TenantContext
    query: string
    /** The assistant message the search is for; keys its metering. */
    messageId: string
    signal?: AbortSignal
  }): Promise<WebSearchOutcome>
}

/** No search provider: a chat that asks for web search is refused. */
export const noChatWebSearch: ChatWebSearch = {
  isConfigured: () => Promise.resolve(false),
  search: () =>
    Promise.resolve({ ok: false, reason: 'not_configured', provider: null, code: null }),
}

export const noChatRetrieval: ChatRetrieval = {
  retrieve: () => Promise.resolve({ passages: [], skipped: null, processingCount: 0 }),
  checkSource: () =>
    Promise.resolve({ status: 'removed', passage: null, canOpenInKnowledge: false }),
}

/**
 * Text out of an uploaded document; images are never parsed. `bytes` is the stored file, for
 * parsers that read it in process; `objectKey` lets a parser hand the ML service a signed URL.
 */
export interface ChatDocumentParser {
  extract(input: {
    orgId: string
    objectKey: string
    contentType: string
    bytes: Buffer
    signal?: AbortSignal
  }): Promise<{ text: string; pageCount: number | null }>
}

/** People's display data (auth module). */
export interface ChatUserRefs {
  findUserRefs(userIds: readonly string[]): Promise<ReadonlyMap<string, UserRefDto>>
}

/** The organization's settings chats read (organizations module). */
export interface ChatOrganizations {
  /** `settings.privacy.chatSharingEnabled`: while false, no share is honored. */
  sharingEnabledInTx(tx: DbExecutor, orgId: string): Promise<boolean>
}

/** In-app notifications (notifications module): `chat.shared`. */
export type ChatNotifications = Pick<NotificationsService, 'notify'>

/** The audit log (audit module): sharing a chat and every change to a shared prompt. */
export type ChatAudit = AuditRecorder

/** A published agent the person may see: shared with them, theirs, or one they manage. */
export interface ChatAgent {
  id: string
  name: string
  /** Only `active` agents answer; a paused or archived one "isn't available anymore". */
  status: 'draft' | 'active' | 'paused' | 'archived'
  /** The live version's model; the `data-model` chunk names it. */
  modelKey: string | null
}

/** Agents and their runs (agents and agentRuns modules): what an agent chat needs. */
export interface ChatAgentRuns {
  findUsable(tx: DbExecutor, ctx: TenantContext, agentId: string): Promise<ChatAgent | undefined>
  /** Queues a `chat` run of the agent's live version for this chat. */
  start(
    ctx: TenantContext,
    input: { agentId: string; chatId: string; messages: AgentRunMessage[] },
  ): Promise<{ id: string }>
  /** The run's event stream as an SSE response. */
  stream(ctx: TenantContext, runId: string): Promise<Response>
  /** The agents of agent chats, by id, with whether the person may still talk to them. */
  refs(
    tx: DbExecutor,
    ctx: TenantContext,
    agentIds: readonly string[],
  ): Promise<ReadonlyMap<string, ChatAgentRefDto>>
}
