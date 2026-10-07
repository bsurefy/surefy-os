// SPDX-License-Identifier: AGPL-3.0-only
import type {
  ChatKnowledgeScope,
  ChatSourcePreviewDto,
  KnowledgeSkippedReason,
  SourcePart,
} from '@surefy/contracts'

import type { DbExecutor } from '@/core/database/index.js'
import type { ModelGatewayService } from '@/modules/modelGateway/index.js'
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
