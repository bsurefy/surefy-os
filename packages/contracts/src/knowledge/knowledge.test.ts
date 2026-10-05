// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import {
  auditActionSchema,
  bulkKnowledgeSourcesInputSchema,
  createKnowledgeBaseInputSchema,
  createKnowledgeLinkInputSchema,
  deletedKnowledgeItemDtoSchema,
  ERROR_CODES,
  FILTER_VALUES_MAX,
  KNOWLEDGE_AUDIT_ACTIONS,
  KNOWLEDGE_ERROR_CODES,
  KNOWLEDGE_FAILURE_CODES,
  KNOWLEDGE_FILE_LIMITS,
  knowledgeDocumentDtoSchema,
  knowledgeSourceConfigSchema,
  knowledgeSourceDtoSchema,
  knowledgeTestSearchInputSchema,
  listDeletedKnowledgeQuerySchema,
  listKnowledgeBasesQuerySchema,
  listKnowledgeSourcesQuerySchema,
  requestKnowledgeFileUploadInputSchema,
  retryKnowledgeSourceInputSchema,
  setKnowledgeAccessInputSchema,
  setKnowledgeEmbeddingModelInputSchema,
  updateKnowledgeBaseInputSchema,
  updateKnowledgeSourceInputSchema,
} from '../index.js'

const id = '0190a5c4-0000-7000-8000-000000000001'
const id2 = '0190a5c4-0000-7000-8000-000000000002'
const sha256 = 'a'.repeat(64)
const now = '2026-10-05T09:00:00.000Z'

const link = {
  url: 'https://docs.example.com/help',
  crawlDepth: 1,
  includePaths: ['/help'],
  excludePaths: [],
  refresh: 'weekly',
} as const

const fileSource = {
  id,
  knowledgeBaseId: id2,
  type: 'file',
  name: 'Handbook.pdf',
  fileName: 'Handbook.pdf',
  contentType: 'application/pdf',
  sizeBytes: 1_200_000,
  link: null,
  connector: null,
  ocrMode: 'auto',
  status: 'ready',
  progressPercent: 100,
  errorCode: null,
  documentCount: 1,
  failedDocumentCount: 0,
  passageCount: 42,
  lastSyncedAt: null,
  nextSyncAt: null,
  addedBy: null,
  deletedAt: null,
  purgeAt: null,
  createdAt: now,
  updatedAt: now,
} as const

describe('knowledge bases', () => {
  it('turns repeated filters into the checked values and restricts the sort', () => {
    expect(listKnowledgeBasesQuerySchema.parse({}).state).toBe('active')
    expect(listKnowledgeBasesQuerySchema.parse({ needsAttention: 'true' }).needsAttention).toBe(
      true,
    )
    expect(listKnowledgeBasesQuerySchema.safeParse({ sort: '-updatedAt' }).success).toBe(true)
    expect(listKnowledgeBasesQuerySchema.safeParse({ sort: 'sourceCount' }).success).toBe(false)
    expect(listKnowledgeBasesQuerySchema.safeParse({ state: 'purged' }).success).toBe(false)
  })

  it('creates with defaults and trims the name', () => {
    expect(createKnowledgeBaseInputSchema.parse({ name: '  HR Policies ' })).toEqual({
      name: 'HR Policies',
      isLocalOnly: false,
      chunkingPreset: 'default',
      teamIds: [],
    })
    expect(createKnowledgeBaseInputSchema.safeParse({ name: '  ' }).success).toBe(false)
    expect(createKnowledgeBaseInputSchema.safeParse({ name: 'x', teamIds: ['nope'] }).success).toBe(
      false,
    )
    expect(
      createKnowledgeBaseInputSchema.safeParse({ name: 'x', chunkingPreset: 'tiny' }).success,
    ).toBe(false)
  })

  it('lets a description be cleared and refuses unknown presets on update', () => {
    expect(updateKnowledgeBaseInputSchema.parse({ description: null })).toEqual({
      description: null,
    })
    expect(updateKnowledgeBaseInputSchema.safeParse({ chunkingPreset: 'faqs' }).success).toBe(true)
    expect(updateKnowledgeBaseInputSchema.safeParse({ chunkingPreset: 'x' }).success).toBe(false)
  })

  it('names the embedding model by its key', () => {
    expect(
      setKnowledgeEmbeddingModelInputSchema.safeParse({ modelKey: 'openai/text-embedding-3-small' })
        .success,
    ).toBe(true)
    expect(setKnowledgeEmbeddingModelInputSchema.safeParse({}).success).toBe(false)
  })
})

describe('knowledge access', () => {
  it('grants Can search or Can manage to a team or a person, never to an agent yet', () => {
    expect(
      setKnowledgeAccessInputSchema.safeParse({
        grants: [
          { subjectType: 'team', teamId: id, level: 'search' },
          { subjectType: 'user', userId: id2, level: 'manage' },
        ],
      }).success,
    ).toBe(true)
    expect(
      setKnowledgeAccessInputSchema.safeParse({
        grants: [{ subjectType: 'agent', agentId: id, level: 'search' }],
      }).success,
    ).toBe(false)
    expect(
      setKnowledgeAccessInputSchema.safeParse({
        grants: [{ subjectType: 'team', teamId: id, level: 'owner' }],
      }).success,
    ).toBe(false)
    expect(
      setKnowledgeAccessInputSchema.safeParse({
        grants: [{ subjectType: 'team', level: 'search' }],
      }).success,
    ).toBe(false)
    expect(setKnowledgeAccessInputSchema.parse({ grants: [] }).grants).toEqual([])
  })
})

describe('sources', () => {
  it('filters the Sources tab by type and status and keeps newest first', () => {
    expect(listKnowledgeSourcesQuerySchema.parse({ type: 'link' }).type).toEqual(['link'])
    expect(listKnowledgeSourcesQuerySchema.parse({ status: ['failed', 'paused'] }).status).toEqual([
      'failed',
      'paused',
    ])
    expect(
      listKnowledgeSourcesQuerySchema.safeParse({
        status: Array.from({ length: FILTER_VALUES_MAX + 1 }, () => 'failed'),
      }).success,
    ).toBe(false)
    expect(listKnowledgeSourcesQuerySchema.parse({}).state).toBe('active')
    expect(listKnowledgeSourcesQuerySchema.safeParse({ sort: '-sizeBytes' }).success).toBe(true)
    expect(listKnowledgeSourcesQuerySchema.safeParse({ sort: 'sha256' }).success).toBe(false)
  })

  it('checks a file upload request: type, size and hash', () => {
    const base = {
      fileName: 'Handbook.pdf',
      contentType: 'application/pdf',
      sizeBytes: 1000,
      sha256,
    }
    const parsed = requestKnowledgeFileUploadInputSchema.parse(base)
    expect(parsed.ocrMode).toBe('auto')
    expect(parsed.duplicate).toBe('reject')
    expect(
      requestKnowledgeFileUploadInputSchema.safeParse({ ...base, duplicate: 'replace' }).success,
    ).toBe(true)
    expect(
      requestKnowledgeFileUploadInputSchema.safeParse({ ...base, contentType: 'application/zip' })
        .success,
    ).toBe(false)
    expect(
      requestKnowledgeFileUploadInputSchema.safeParse({
        ...base,
        sizeBytes: KNOWLEDGE_FILE_LIMITS.maxBytes + 1,
      }).success,
    ).toBe(false)
    expect(requestKnowledgeFileUploadInputSchema.safeParse({ ...base, sizeBytes: 0 }).success).toBe(
      false,
    )
    expect(
      requestKnowledgeFileUploadInputSchema.safeParse({ ...base, sha256: 'ABC' }).success,
    ).toBe(false)
  })

  it('limits the crawl of a link and its path rules', () => {
    expect(createKnowledgeLinkInputSchema.safeParse(link).success).toBe(true)
    expect(createKnowledgeLinkInputSchema.safeParse({ ...link, crawlDepth: 4 }).success).toBe(false)
    expect(createKnowledgeLinkInputSchema.safeParse({ ...link, url: 'not a url' }).success).toBe(
      false,
    )
    expect(createKnowledgeLinkInputSchema.safeParse({ ...link, refresh: 'hourly' }).success).toBe(
      false,
    )
    expect(
      createKnowledgeLinkInputSchema.safeParse({
        ...link,
        includePaths: Array.from({ length: 21 }, (_, index) => `/p${index}`),
      }).success,
    ).toBe(false)
  })

  it('stores exactly one of link and connector in the v1 config', () => {
    expect(knowledgeSourceConfigSchema.safeParse({ version: 1, link }).success).toBe(true)
    expect(
      knowledgeSourceConfigSchema.safeParse({
        version: 1,
        connector: {
          provider: 'notion',
          folders: [{ externalId: 'abc', name: 'Wiki' }],
          syncEvery: 'daily',
        },
      }).success,
    ).toBe(true)
    expect(knowledgeSourceConfigSchema.safeParse({ version: 1 }).success).toBe(false)
    expect(knowledgeSourceConfigSchema.safeParse({ version: 2, link }).success).toBe(false)
  })

  it('changes a link without changing its address', () => {
    expect(updateKnowledgeSourceInputSchema.parse({ link: { refresh: 'daily' } })).toEqual({
      link: { refresh: 'daily' },
    })
    expect(
      updateKnowledgeSourceInputSchema.parse({ link: { url: 'https://other.example.com' } }).link,
    ).toEqual({})
  })

  it('retries with or without OCR and bounds the bulk actions', () => {
    expect(retryKnowledgeSourceInputSchema.parse({})).toEqual({ withOcr: false })
    expect(
      bulkKnowledgeSourcesInputSchema.safeParse({ action: 'reindex', sourceIds: [id] }).success,
    ).toBe(true)
    expect(
      bulkKnowledgeSourcesInputSchema.safeParse({ action: 'reindex', sourceIds: [] }).success,
    ).toBe(false)
    expect(
      bulkKnowledgeSourcesInputSchema.safeParse({ action: 'download', sourceIds: [id] }).success,
    ).toBe(false)
  })

  it('describes a source and a failed document with a known reason', () => {
    expect(knowledgeSourceDtoSchema.safeParse(fileSource).success).toBe(true)
    expect(
      knowledgeSourceDtoSchema.safeParse({
        ...fileSource,
        status: 'failed',
        errorCode: KNOWLEDGE_ERROR_CODES.KNOWLEDGE_FILE_UNSUPPORTED,
      }).success,
    ).toBe(true)
    expect(
      knowledgeSourceDtoSchema.safeParse({ ...fileSource, errorCode: 'SOMETHING_ELSE' }).success,
    ).toBe(false)
    expect(
      knowledgeSourceDtoSchema.safeParse({ ...fileSource, progressPercent: 101 }).success,
    ).toBe(false)
    expect(
      knowledgeDocumentDtoSchema.safeParse({
        id,
        knowledgeBaseId: id2,
        sourceId: id,
        title: 'Handbook',
        mimeType: 'application/pdf',
        sizeBytes: 10,
        pageCount: 4,
        status: 'failed',
        errorCode: KNOWLEDGE_ERROR_CODES.KNOWLEDGE_PROCESSING_TIMEOUT,
        chunkCount: 0,
        citationCount: 0,
        indexedAt: null,
        createdAt: now,
        updatedAt: now,
      }).success,
    ).toBe(true)
  })
})

describe('Recently deleted', () => {
  it('lists bases and sources with the time left to restore them', () => {
    const shared = { id, name: 'HR Policies', deletedAt: now, purgeAt: now, deletedBy: null }
    expect(
      deletedKnowledgeItemDtoSchema.safeParse({
        kind: 'knowledge_base',
        ...shared,
        sourceCount: 3,
        canRestore: true,
      }).success,
    ).toBe(true)
    expect(
      deletedKnowledgeItemDtoSchema.safeParse({
        kind: 'source',
        ...shared,
        sourceType: 'link',
        knowledgeBase: { id: id2, name: 'Help center' },
        canRestore: false,
      }).success,
    ).toBe(true)
    expect(
      deletedKnowledgeItemDtoSchema.safeParse({ kind: 'source', ...shared, canRestore: true })
        .success,
    ).toBe(false)
    expect(listDeletedKnowledgeQuerySchema.parse({ kind: 'source' }).kind).toEqual(['source'])
  })
})

describe('test search', () => {
  it('searches as the person by default and bounds relevance and passages', () => {
    expect(knowledgeTestSearchInputSchema.parse({ question: ' Refund policy? ' })).toEqual({
      question: 'Refund policy?',
      minRelevance: 0,
      passagesPerAnswer: 5,
      searchAs: { type: 'me' },
      includeAnswer: true,
    })
    expect(
      knowledgeTestSearchInputSchema.safeParse({
        question: 'x',
        searchAs: { type: 'team', teamId: id },
        minRelevance: 0.4,
      }).success,
    ).toBe(true)
    expect(
      knowledgeTestSearchInputSchema.safeParse({ question: 'x', searchAs: { type: 'team' } })
        .success,
    ).toBe(false)
    expect(
      knowledgeTestSearchInputSchema.safeParse({ question: 'x', minRelevance: 1.5 }).success,
    ).toBe(false)
    expect(
      knowledgeTestSearchInputSchema.safeParse({ question: 'x', passagesPerAnswer: 0 }).success,
    ).toBe(false)
    expect(knowledgeTestSearchInputSchema.safeParse({ question: '' }).success).toBe(false)
  })
})

describe('knowledge errors and audit actions', () => {
  it('registers every knowledge code in the shared error list', () => {
    for (const code of Object.values(KNOWLEDGE_ERROR_CODES)) {
      expect(ERROR_CODES).toHaveProperty(code, code)
    }
    for (const code of KNOWLEDGE_FAILURE_CODES) {
      expect(Object.values(KNOWLEDGE_ERROR_CODES)).toContain(code)
    }
  })

  it('writes audit actions in the shared <area>.<verb> shape', () => {
    for (const action of Object.values(KNOWLEDGE_AUDIT_ACTIONS)) {
      expect(auditActionSchema.safeParse(action).success).toBe(true)
    }
  })
})
