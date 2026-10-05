// SPDX-License-Identifier: AGPL-3.0-only
import type { OrgRole, TeamRefDto, UserRefDto } from '@surefy/contracts'

import type { DbExecutor } from '@/core/database/index.js'
import type { ModelGatewayService } from '@/modules/modelGateway/index.js'
import type { TenantContext } from '@/types/context.js'

/** What the services need from the request: the verified organization and who acts. */
export type KnowledgeContext = Pick<TenantContext, 'orgId' | 'userId' | 'teamIds'> & {
  role: OrgRole | null
} & Partial<
    Pick<TenantContext, 'via' | 'requestId' | 'ip' | 'userAgent' | 'apiKey' | 'grantId'>
  > & {
    /** Needed by calls that reach a model (test search): the models the caller may use. */
    access?: Pick<TenantContext['access'], 'allowedModelIds' | 'primaryTeamId'>
  }

/** Whose rights a search runs with: the person, or a team's members at their own role. */
export interface KnowledgeSearcher {
  userId: string | null
  role: OrgRole | null
  teamIds: readonly string[]
}

/** The teams module's team references (existence and names). */
export interface KnowledgeTeams {
  findRefsInTx(tx: DbExecutor, orgId: string, teamIds: readonly string[]): Promise<TeamRefDto[]>
}

/** Display data of people, from the module that owns `users`. */
export interface KnowledgeUsers {
  findUserRefs(userIds: readonly string[]): Promise<ReadonlyMap<string, UserRefDto>>
}

/** The organizations module's access version bump, in the caller's transaction. */
export interface KnowledgeOrganizations {
  bumpAccessVersionInTx(tx: DbExecutor, orgId: string): Promise<void>
}

/** The members module's active-membership lookup, for access grants to people. */
export interface KnowledgeMemberships {
  findActiveByUsersInTx(
    tx: DbExecutor,
    orgId: string,
    userIds: readonly string[],
  ): Promise<ReadonlyMap<string, { userId: string; role: OrgRole; primaryTeamId: string | null }>>
}

/** A Vault model as knowledge needs it: to name, check and route an embedding model. */
export interface KnowledgeModelRef {
  modelKey: string
  displayName: string
  type: string
  source: string
  isEnabled: boolean
  status: string
  embeddingDimensions: number | null
}

/** The Vault's models and the organization's embedding model (vault module, `ModelsRepository`). */
export interface KnowledgeModels {
  findByKeyInTx(
    tx: DbExecutor,
    orgId: string,
    modelKey: string,
  ): Promise<KnowledgeModelRef | undefined>
  findByKeysInTx(
    tx: DbExecutor,
    orgId: string,
    modelKeys: readonly string[],
  ): Promise<KnowledgeModelRef[]>
  /** The first usable chat model of the fallback order, which writes answer previews. */
  defaultChatModelKeyInTx(tx: DbExecutor, orgId: string): Promise<KnowledgeModelRef | null>
  /** The model key of the organization's default embedding model; null until one is chosen. */
  organizationEmbeddingModelKeyInTx(tx: DbExecutor, orgId: string): Promise<string | null>
}

/** What the ingestion sub-module offers the services: jobs enqueued after a transaction commits. */
export interface KnowledgeIngestionPort {
  /**
   * Puts the base's documents back to `pending` and their sources to `queued`, in the caller's
   * transaction (a chunking preset change, "Re-index all"); returns the ids to enqueue after commit.
   */
  resetDocumentsInTx(
    tx: DbExecutor,
    orgId: string,
    baseId: string,
    sourceIds?: readonly string[],
  ): Promise<string[]>
  /**
   * Puts the failed documents of a source back to `pending` and the source to `queued`
   * ("Retry"; `withOcr` also sets the source's OCR mode to `force`); returns the ids to enqueue.
   */
  retryDocumentsInTx(
    tx: DbExecutor,
    orgId: string,
    baseId: string,
    sourceId: string,
    withOcr: boolean,
  ): Promise<string[]>
  /** Deletes the base's chunks of one embedding model (cancelling a model change). */
  deleteChunksOfModelInTx(
    tx: DbExecutor,
    orgId: string,
    baseId: string,
    modelKey: string,
  ): Promise<void>
  /** One `ingestDocument` job per document (jobId `ingest-{documentId}`). */
  enqueueDocuments(orgId: string, documentIds: readonly string[]): Promise<void>
  /** `reembedKnowledgeBase` for a base whose embedding model is changing. */
  enqueueReembed(orgId: string, baseId: string): Promise<void>
  /** `syncSource` for a link source (first crawl, "Sync now", a retry). */
  enqueueSync(orgId: string, sourceId: string): Promise<void>
}

/** The model gateway calls knowledge makes: question embeddings and answer previews. */
export type KnowledgeGateway = Pick<ModelGatewayService, 'embedMany' | 'generateText'>

export interface KnowledgeSignedUpload {
  url: string
  method: 'PUT'
  headers: Record<string, string>
  expiresAt: Date
}

/** Object storage as knowledge uses it (`orgs/{orgId}/knowledge/{documentId}/…` keys). */
export interface KnowledgeFiles {
  /** A short-lived signed PUT for a file source; the bytes go straight to storage. */
  signedUpload(
    key: string,
    options: { contentType: string; sizeBytes: number; expiresInSeconds: number },
  ): Promise<KnowledgeSignedUpload>
  /** A short-lived signed GET, for the ML service and for downloads. */
  signedDownload(
    key: string,
    options: { expiresInSeconds: number; disposition?: string },
  ): Promise<string>
  /** Size and SHA-256 (hex) of a stored object; null when nothing is stored under the key. */
  inspect(key: string): Promise<{ sizeBytes: number; sha256: string } | null>
  put(key: string, body: Buffer, contentType: string): Promise<void>
  /** The whole object (parsed JSON, a crawled page); null when missing. */
  read(key: string): Promise<Buffer | null>
  delete(key: string): Promise<void>
}
