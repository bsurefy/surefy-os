// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import {
  bulkKnowledgeSourcesInputSchema,
  bulkKnowledgeSourcesResultDtoSchema,
  createKnowledgeBaseInputSchema,
  createKnowledgeLinkInputSchema,
  deletedKnowledgeItemDtoSchema,
  ERROR_CODES,
  KNOWLEDGE_RESTORE_WINDOW_DAYS,
  knowledgeAccessDtoSchema,
  knowledgeAccessGrantDtoSchema,
  knowledgeAccessImpactDtoSchema,
  knowledgeBaseDtoSchema,
  knowledgeBaseImpactDtoSchema,
  knowledgeDocumentDetailDtoSchema,
  knowledgeDocumentDownloadDtoSchema,
  knowledgeDocumentDtoSchema,
  knowledgeDocumentPageDtoSchema,
  knowledgeFileUploadDtoSchema,
  knowledgeReindexImpactDtoSchema,
  knowledgeSourceDtoSchema,
  knowledgeSummaryDtoSchema,
  knowledgeTestSearchDtoSchema,
  knowledgeTestSearchInputSchema,
  localModelKey,
  okResponse,
  pageResponse,
  PAGE_SIZE,
  providerModelKey,
  requestKnowledgeFileUploadInputSchema,
  restoreKnowledgeBaseInputSchema,
  retryKnowledgeSourceInputSchema,
  setKnowledgeAccessInputSchema,
  setKnowledgeEmbeddingModelInputSchema,
  updateKnowledgeBaseInputSchema,
  updateKnowledgeSourceInputSchema,
} from '@surefy/contracts'
import type {
  KnowledgeAccessGrantDto,
  KnowledgeBaseDto,
  KnowledgeChunkingPreset,
  KnowledgeDocumentDto,
  KnowledgeEmbeddingModelDto,
  KnowledgeReindexProgressDto,
  KnowledgeSourceDto,
  KnowledgeTestPassageDto,
} from '@surefy/contracts'
import { defineFactory, fixtureUuid } from '@surefy/web-core/testing'
import {
  defineMockDomain,
  defineMockHandler,
  mockError,
  mockOk,
  mockPage,
} from '@surefy/web-core/testing/mock'

import { MAYA, OMAR } from './shell.fixtures'
import { ANA, SALES_TEAM_ID, SUPPORT_TEAM_ID } from './teams'
import { OLLAMA_SERVER_ID } from './vault'

const BASE_KIND = 80
const SOURCE_KIND = 81
const DOCUMENT_KIND = 82
const GRANT_KIND = 83
const CHUNK_KIND = 84
const HTTP_ACCEPTED = 202
const HTTP_CONFLICT = 409
const HTTP_NOT_FOUND = 404
const HTTP_UNPROCESSABLE = 422
const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000
const STEP_PERCENT = 40
const START_PERCENT = 10
const MATCH_CONTEXT = 120
const MINUTE_CHUNKS = 60

export const HELP_CENTER_ID = fixtureUuid(BASE_KIND, 1)
export const HR_POLICIES_ID = fixtureUuid(BASE_KIND, 2)
export const SALES_PLAYBOOK_ID = fixtureUuid(BASE_KIND, 3)
export const LEGACY_NOTES_ID = fixtureUuid(BASE_KIND, 4)
export const OLD_WIKI_ID = fixtureUuid(BASE_KIND, 5)

export const REFUND_SOURCE_ID = fixtureUuid(SOURCE_KIND, 1)
export const FAQ_SOURCE_ID = fixtureUuid(SOURCE_KIND, 2)
export const ONBOARDING_SOURCE_ID = fixtureUuid(SOURCE_KIND, 3)
export const SCAN_SOURCE_ID = fixtureUuid(SOURCE_KIND, 4)
export const SLOW_SOURCE_ID = fixtureUuid(SOURCE_KIND, 5)
export const HANDBOOK_SOURCE_ID = fixtureUuid(SOURCE_KIND, 6)
export const OLD_PRICING_SOURCE_ID = fixtureUuid(SOURCE_KIND, 7)

export const REFUND_DOCUMENT_ID = fixtureUuid(DOCUMENT_KIND, 1)

/** The embedding models the mock knows, as the Vault mock lists them. */
export const CLOUD_EMBEDDING: KnowledgeEmbeddingModelDto = {
  modelKey: providerModelKey('openai', 'text-embedding-3-small'),
  displayName: 'Text embedding 3 small',
  dataLocation: 'provider',
}
export const LOCAL_EMBEDDING: KnowledgeEmbeddingModelDto = {
  modelKey: localModelKey(OLLAMA_SERVER_ID, 'nomic-embed-text'),
  displayName: 'nomic-embed-text',
  dataLocation: 'local',
}
const EMBEDDINGS = [CLOUD_EMBEDDING, LOCAL_EMBEDDING]

const SUPPORT = { id: SUPPORT_TEAM_ID, name: 'Support' }
const SALES = { id: SALES_TEAM_ID, name: 'Sales' }
const TEAMS = [SUPPORT, SALES]
const LEE = { id: fixtureUuid(1, 4), name: 'Lee Chen', email: 'lee@acme.test', imageUrl: null }
const PEOPLE = [MAYA, OMAR, ANA, LEE]
const SUPPORT_AGENTS = [
  { id: fixtureUuid(60, 1), name: 'Support triage' },
  { id: fixtureUuid(60, 2), name: 'Refund helper' },
]

const ago = (ms: number) => new Date(Date.now() - ms).toISOString()

interface BaseState {
  id: string
  name: string
  description: string | null
  isLocalOnly: boolean
  chunkingPreset: KnowledgeChunkingPreset
  embeddingModel: KnowledgeEmbeddingModelDto | null
  reindex: KnowledgeReindexProgressDto | null
  usedByCount: number
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

interface SourceState {
  dto: KnowledgeSourceDto
  deletedBy: typeof MAYA | null
  /** Seeded in-progress sources stay as they are; sources created in a test move on by themselves. */
  isFrozen: boolean
  sha256: string | null
}

interface ChunkState {
  chunkId: string
  documentId: string
  sourceId: string
  baseId: string
  documentTitle: string
  content: string
  page: number | null
  headingPath: string[]
}

/** A source with no documents yet, outside any state, unless overridden. */
export const sourceFactory = defineFactory(
  knowledgeSourceDtoSchema,
  (sequence): KnowledgeSourceDto => ({
    id: fixtureUuid(SOURCE_KIND, sequence),
    knowledgeBaseId: HELP_CENTER_ID,
    type: 'file',
    name: `File ${sequence}.pdf`,
    fileName: `File ${sequence}.pdf`,
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
    passageCount: 12,
    lastSyncedAt: null,
    nextSyncAt: null,
    addedBy: MAYA,
    deletedAt: null,
    purgeAt: null,
    createdAt: '2026-01-02T09:00:00.000Z',
    updatedAt: '2026-01-02T09:00:00.000Z',
  }),
)

export const documentFactory = defineFactory(
  knowledgeDocumentDtoSchema,
  (sequence): KnowledgeDocumentDto => ({
    id: fixtureUuid(DOCUMENT_KIND, sequence),
    knowledgeBaseId: HELP_CENTER_ID,
    sourceId: REFUND_SOURCE_ID,
    title: `Document ${sequence}`,
    mimeType: 'application/pdf',
    sizeBytes: 1_200_000,
    pageCount: 4,
    status: 'ready',
    errorCode: null,
    chunkCount: 12,
    citationCount: 0,
    indexedAt: '2026-01-02T09:05:00.000Z',
    createdAt: '2026-01-02T09:00:00.000Z',
    updatedAt: '2026-01-02T09:05:00.000Z',
  }),
)

export const grantFactory = defineFactory(
  knowledgeAccessGrantDtoSchema,
  (sequence): KnowledgeAccessGrantDto => ({
    id: fixtureUuid(GRANT_KIND, sequence),
    subjectType: 'team',
    team: SUPPORT,
    user: null,
    level: 'search',
    createdAt: '2026-01-02T09:00:00.000Z',
  }),
)

let bases: BaseState[] = []
let sources: SourceState[] = []
let documents: KnowledgeDocumentDto[] = []
let chunks: ChunkState[] = []
let pageTexts = new Map<string, string[]>()
let grants = new Map<string, KnowledgeAccessGrantDto[]>()

function baseState(overrides: Partial<BaseState> & Pick<BaseState, 'id' | 'name'>): BaseState {
  return {
    description: null,
    isLocalOnly: false,
    chunkingPreset: 'default',
    embeddingModel: CLOUD_EMBEDDING,
    reindex: null,
    usedByCount: 0,
    createdAt: ago(40 * DAY_MS),
    updatedAt: ago(2 * DAY_MS),
    deletedAt: null,
    ...overrides,
  }
}

function addDocument(
  source: KnowledgeSourceDto,
  title: string,
  overrides: Partial<KnowledgeDocumentDto>,
  text: string[],
  chunkTexts: string[] = [],
): KnowledgeDocumentDto {
  const document = documentFactory({
    knowledgeBaseId: source.knowledgeBaseId,
    sourceId: source.id,
    title,
    chunkCount: chunkTexts.length > 0 ? chunkTexts.length : (overrides.chunkCount ?? 0),
    ...overrides,
  })
  documents.push(document)
  pageTexts.set(document.id, text)
  for (const [index, content] of chunkTexts.entries()) {
    chunks.push({
      chunkId: fixtureUuid(CHUNK_KIND, chunks.length + 1),
      documentId: document.id,
      sourceId: source.id,
      baseId: source.knowledgeBaseId,
      documentTitle: title,
      content,
      page: index + 1,
      headingPath: [title],
    })
  }
  return document
}

/** Seeded relative to now, so "Recently deleted" counts down the same way in every run. */
function seed(): void {
  sourceFactory.reset()
  documentFactory.reset()
  grantFactory.reset()
  bases = [
    baseState({
      id: HELP_CENTER_ID,
      name: 'Help center',
      description: 'Articles and policies the support team answers from.',
      usedByCount: 2,
    }),
    baseState({
      id: HR_POLICIES_ID,
      name: 'HR Policies',
      isLocalOnly: true,
      embeddingModel: LOCAL_EMBEDDING,
      updatedAt: ago(9 * DAY_MS),
    }),
    baseState({ id: SALES_PLAYBOOK_ID, name: 'Sales playbook', updatedAt: ago(20 * DAY_MS) }),
    baseState({
      id: LEGACY_NOTES_ID,
      name: 'Legacy notes',
      embeddingModel: null,
      updatedAt: ago(60 * DAY_MS),
    }),
    baseState({ id: OLD_WIKI_ID, name: 'Old wiki', deletedAt: ago(3 * DAY_MS) }),
  ]
  sources = []
  documents = []
  chunks = []
  pageTexts = new Map()

  const add = (overrides: Partial<KnowledgeSourceDto>, options: Partial<SourceState> = {}) => {
    const dto = sourceFactory(overrides)
    sources.push({ dto, deletedBy: null, isFrozen: true, sha256: null, ...options })
    return dto
  }

  const refund = add({
    id: REFUND_SOURCE_ID,
    name: 'Refund policy.pdf',
    fileName: 'Refund policy.pdf',
    passageCount: 3,
    createdAt: ago(10 * DAY_MS),
  })
  addDocument(
    refund,
    'Refund policy',
    { id: REFUND_DOCUMENT_ID, chunkCount: 3, citationCount: 7 },
    [
      'Refunds. Customers may cancel an annual plan within 14 days of purchase and receive a full refund.',
      'Monthly plans are not refunded, but the subscription stays active until the end of the paid month.',
      'Contact support to request a refund. Refunds are paid to the original payment method within 5 business days.',
    ],
    [
      'Customers may cancel an annual plan within 14 days of purchase and receive a full refund.',
      'Monthly plans are not refunded, but the subscription stays active until the end of the paid month.',
      'Refunds are paid to the original payment method within 5 business days after support approves the request.',
    ],
  )

  const faq = add({
    id: FAQ_SOURCE_ID,
    type: 'link',
    name: 'help.acme.test',
    fileName: null,
    contentType: null,
    sizeBytes: null,
    link: {
      url: 'https://help.acme.test/faq',
      crawlDepth: 1,
      includePaths: [],
      excludePaths: ['/blog'],
      refresh: 'weekly',
    },
    status: 'partially_failed',
    documentCount: 3,
    failedDocumentCount: 1,
    passageCount: 18,
    lastSyncedAt: ago(DAY_MS),
    nextSyncAt: new Date(Date.now() + 6 * DAY_MS).toISOString(),
    createdAt: ago(8 * DAY_MS),
  })
  addDocument(
    faq,
    'Shipping times',
    { sourceId: faq.id, mimeType: 'text/html', pageCount: null, chunkCount: 9 },
    ['Orders ship within 2 business days.'],
    ['Orders ship within 2 business days and arrive in 3 to 5 days.'],
  )
  addDocument(
    faq,
    'Password reset',
    { sourceId: faq.id, mimeType: 'text/html', pageCount: null, chunkCount: 9 },
    ['Use the reset link on the sign-in page.'],
  )
  addDocument(
    faq,
    'Old promotions',
    {
      sourceId: faq.id,
      mimeType: 'text/html',
      pageCount: null,
      status: 'failed',
      errorCode: 'KNOWLEDGE_DOWNLOAD_FAILED',
      chunkCount: 0,
    },
    [],
  )

  add({
    id: ONBOARDING_SOURCE_ID,
    name: 'Onboarding.docx',
    fileName: 'Onboarding.docx',
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    status: 'processing',
    progressPercent: 60,
    passageCount: 0,
    createdAt: ago(HOUR_MS),
  })
  add({
    id: SCAN_SOURCE_ID,
    name: 'Scan 0042.tiff',
    fileName: 'Scan 0042.tiff',
    contentType: 'image/tiff',
    status: 'failed',
    progressPercent: 100,
    errorCode: 'KNOWLEDGE_FILE_UNSUPPORTED',
    documentCount: 1,
    failedDocumentCount: 1,
    passageCount: 0,
    createdAt: ago(2 * DAY_MS),
  })
  add({
    id: SLOW_SOURCE_ID,
    name: 'Price list.xlsx',
    fileName: 'Price list.xlsx',
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    status: 'failed',
    errorCode: 'KNOWLEDGE_PROCESSING_TIMEOUT',
    documentCount: 1,
    failedDocumentCount: 1,
    passageCount: 0,
    createdAt: ago(3 * DAY_MS),
  })
  add(
    {
      id: OLD_PRICING_SOURCE_ID,
      knowledgeBaseId: HELP_CENTER_ID,
      name: 'Old pricing.pdf',
      fileName: 'Old pricing.pdf',
      deletedAt: ago(5 * DAY_MS),
      purgeAt: ago(5 * DAY_MS - KNOWLEDGE_RESTORE_WINDOW_DAYS * DAY_MS),
    },
    { deletedBy: MAYA },
  )
  add({
    id: HANDBOOK_SOURCE_ID,
    knowledgeBaseId: HR_POLICIES_ID,
    name: 'Handbook.pdf',
    fileName: 'Handbook.pdf',
    passageCount: 40,
    createdAt: ago(30 * DAY_MS),
  })
  grants = new Map([
    [
      HELP_CENTER_ID,
      [
        grantFactory({ team: SUPPORT, level: 'search' }),
        grantFactory({ team: null, user: OMAR, subjectType: 'user', level: 'manage' }),
      ],
    ],
    [HR_POLICIES_ID, []],
    [SALES_PLAYBOOK_ID, [grantFactory({ team: SALES, level: 'search' })]],
    [LEGACY_NOTES_ID, []],
    [OLD_WIKI_ID, []],
  ])
}

seed()

/** Back to the seeded bases, sources and documents; tests call it between cases. */
export function resetKnowledgeMock(): void {
  seed()
}

const activeSources = (baseId: string) =>
  sources.filter(({ dto }) => dto.knowledgeBaseId === baseId && !dto.deletedAt)

const IN_PROGRESS = new Set(['uploading', 'queued', 'processing'])
const NEEDS_ATTENTION = new Set(['partially_failed', 'failed', 'paused'])

function toBaseDto(state: BaseState, level: 'search' | 'manage'): KnowledgeBaseDto {
  const own = activeSources(state.id).map(({ dto }) => dto)
  const inProgress = own.filter(({ status }) => IN_PROGRESS.has(status))
  const baseGrants = grants.get(state.id) ?? []
  return {
    id: state.id,
    name: state.name,
    description: state.description,
    isLocalOnly: state.isLocalOnly,
    chunkingPreset: state.chunkingPreset,
    embeddingModel: state.embeddingModel,
    reindex: state.reindex,
    sourceCount: own.length,
    sourcesByType: {
      file: own.filter(({ type }) => type === 'file').length,
      link: own.filter(({ type }) => type === 'link').length,
      connector: own.filter(({ type }) => type === 'connector').length,
    },
    documentCount: own.reduce((sum, { documentCount }) => sum + documentCount, 0),
    chunkCount: own.reduce((sum, { passageCount }) => sum + passageCount, 0),
    processing: {
      ready: own.filter(({ status }) => status === 'ready').length,
      inProgress: inProgress.length,
      needsAttention: own.filter(({ status }) => NEEDS_ATTENTION.has(status)).length,
      progressPercent: inProgress.length
        ? Math.round(
            inProgress.reduce((sum, { progressPercent }) => sum + progressPercent, 0) /
              inProgress.length,
          )
        : 0,
    },
    usedByCount: state.usedByCount,
    accessTeams: baseGrants.flatMap(({ team }) => (team ? [team] : [])),
    effectiveLevel: level,
    createdBy: MAYA,
    deletedAt: state.deletedAt,
    purgeAt: state.deletedAt
      ? new Date(Date.parse(state.deletedAt) + KNOWLEDGE_RESTORE_WINDOW_DAYS * DAY_MS).toISOString()
      : null,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
  }
}

const findBase = (id: unknown) => bases.find((base) => base.id === id && !base.deletedAt)
const findSource = (baseId: unknown, id: unknown) =>
  sources.find(({ dto }) => dto.knowledgeBaseId === baseId && dto.id === id)
const setBase = (next: BaseState) => {
  bases = bases.map((base) => (base.id === next.id ? next : base))
}
const setSource = (next: SourceState) => {
  sources = sources.map((state) => (state.dto.id === next.dto.id ? next : state))
}
const touch = (baseId: string) => {
  const found = bases.find((base) => base.id === baseId)
  if (found) setBase({ ...found, updatedAt: new Date().toISOString() })
}
const nameTaken = (name: string, exceptId?: string) =>
  bases.some(
    (base) =>
      !base.deletedAt && base.id !== exceptId && base.name.toLowerCase() === name.toLowerCase(),
  )

/** A source created in a test moves on by itself each time the list is read: queued, processing, ready. */
function advance(state: SourceState): SourceState {
  if (state.isFrozen || state.dto.deletedAt) return state
  const { dto } = state
  if (dto.status === 'queued') {
    return { ...state, dto: { ...dto, status: 'processing', progressPercent: START_PERCENT } }
  }
  if (dto.status !== 'processing') return state
  const progress = dto.progressPercent + STEP_PERCENT
  if (progress < 100) return { ...state, dto: { ...dto, progressPercent: progress } }
  documents = documents.map((document) =>
    document.sourceId === dto.id ? { ...document, status: 'ready', chunkCount: 8 } : document,
  )
  return { ...state, dto: { ...dto, status: 'ready', progressPercent: 100, passageCount: 8 } }
}

function advanceReindex(state: BaseState): BaseState {
  if (!state.reindex) return state
  const done = state.reindex.documentsDone + 1
  if (done < state.reindex.documentsTotal) {
    return { ...state, reindex: { ...state.reindex, documentsDone: done } }
  }
  return {
    ...state,
    embeddingModel: state.reindex.target ?? state.embeddingModel,
    reindex: null,
  }
}

function page(items: readonly object[], url: URL) {
  const limit = Number(url.searchParams.get('limit') ?? PAGE_SIZE.default)
  const start = Number(url.searchParams.get('cursor') ?? 0)
  const next = start + limit < items.length ? String(start + limit) : null
  return mockPage(items.slice(start, start + limit) as never[], next)
}

/** Sorts ascending by `compare`, descending when the sort key starts with `-`. */
const directed =
  <Item>(sort: string, compare: (a: Item, b: Item) => number) =>
  (a: Item, b: Item) =>
    (sort.startsWith('-') ? -1 : 1) * compare(a, b)

const byCreatedAt = (a: KnowledgeSourceDto, b: KnowledgeSourceDto) =>
  Date.parse(a.createdAt) - Date.parse(b.createdAt)
const byBaseName = (a: KnowledgeBaseDto, b: KnowledgeBaseDto) => a.name.localeCompare(b.name)

const sourceComparators: Record<string, (a: KnowledgeSourceDto, b: KnowledgeSourceDto) => number> =
  {
    name: (a, b) => a.name.localeCompare(b.name),
    sizeBytes: (a, b) => (a.sizeBytes ?? 0) - (b.sizeBytes ?? 0),
    createdAt: (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
  }

const baseComparators: Record<string, (a: KnowledgeBaseDto, b: KnowledgeBaseDto) => number> = {
  name: byBaseName,
  updatedAt: (a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt),
}

const noContent = () => new Response(null, { status: 204 })
const notFound = () => mockError(HTTP_NOT_FOUND, ERROR_CODES.KNOWLEDGE_NOT_FOUND, 'Not found')
const sourceNotFound = () =>
  mockError(HTTP_NOT_FOUND, ERROR_CODES.KNOWLEDGE_SOURCE_NOT_FOUND, 'Source not found')
const nameTakenError = () =>
  mockError(HTTP_CONFLICT, ERROR_CODES.KNOWLEDGE_NAME_TAKEN, 'Name taken')
const noEmbeddingError = () =>
  mockError(HTTP_CONFLICT, ERROR_CODES.KNOWLEDGE_NO_EMBEDDING_MODEL, 'No embedding model')
const localRequiredError = () =>
  mockError(
    HTTP_UNPROCESSABLE,
    ERROR_CODES.KNOWLEDGE_LOCAL_EMBEDDING_REQUIRED,
    'A local embedding model is required',
  )

const path = '/orgs/:orgId/knowledge-bases'
const basePath = `${path}/:baseId`
const sourcesPath = `${basePath}/sources`
const documentsPath = `${basePath}/documents`

type Level = 'search' | 'manage'

const listBases =
  (level: Level) =>
  ({ request }: { request: Request }) => {
    const url = new URL(request.url)
    const q = url.searchParams.get('q')?.toLowerCase()
    const isDeleted = url.searchParams.get('state') === 'deleted'
    const localOnly = url.searchParams.get('isLocalOnly')
    const needsAttention = url.searchParams.get('needsAttention')
    const sort = url.searchParams.get('sort') ?? 'name'
    const items = bases
      .filter((base) => Boolean(base.deletedAt) === isDeleted)
      .filter((base) => !q || base.name.toLowerCase().includes(q))
      .filter((base) => localOnly === null || base.isLocalOnly === (localOnly === 'true'))
      .map((base) => toBaseDto(base, level))
      .filter(
        (base) =>
          needsAttention === null ||
          base.processing.needsAttention > 0 === (needsAttention === 'true'),
      )
      .sort(directed(sort, baseComparators[sort.replace('-', '')] ?? byBaseName))
    return page(items, url)
  }

const getBase =
  (level: Level) =>
  ({ params }: { params: Record<string, unknown> }) => {
    const found = findBase(params.baseId)
    if (!found) return notFound()
    // the model change finishes document by document while the page polls
    const advanced = advanceReindex(found)
    if (advanced !== found) setBase(advanced)
    return mockOk(toBaseDto(advanced, level))
  }

function countDocuments(baseId: string): number {
  return documents.filter((document) => document.knowledgeBaseId === baseId).length
}

function startReindex(found: BaseState, target: KnowledgeEmbeddingModelDto | null): BaseState {
  const next: BaseState = {
    ...found,
    reindex: {
      target,
      documentsTotal: Math.max(countDocuments(found.id), 1),
      documentsDone: 0,
    },
    updatedAt: new Date().toISOString(),
  }
  setBase(next)
  return next
}

/** Question words against passage words: enough to rank the seeded passages the way a reader would. */
function score(question: string, content: string): number {
  const words = question
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2)
  if (words.length === 0) return 0
  const haystack = content.toLowerCase()
  return words.filter((word) => haystack.includes(word)).length / words.length
}

function toPassage(chunk: ChunkState, relevance: number, isUsed: boolean): KnowledgeTestPassageDto {
  const source = sources.find(({ dto }) => dto.id === chunk.sourceId)
  return {
    chunkId: chunk.chunkId,
    documentId: chunk.documentId,
    sourceId: chunk.sourceId,
    documentTitle: chunk.documentTitle,
    sourceName: source?.dto.name ?? chunk.documentTitle,
    pageFrom: chunk.page,
    pageTo: chunk.page,
    headingPath: chunk.headingPath,
    content: chunk.content,
    relevance,
    isUsed,
  }
}

const sourceStateInvalid = () =>
  mockError(HTTP_CONFLICT, ERROR_CODES.KNOWLEDGE_SOURCE_STATE_INVALID, 'Does not apply')

/**
 * Knowledge bases, sources, documents and test search (C-04's routes) until the integration task
 * (I4-05) switches to the real API. Sources created in a test move on by themselves: queued,
 * processing, ready; the seeded ones stay as they are (ready, processing, failed, partly failed).
 * Scenarios: `search-only` (the caller can only search); `name-taken` fails a create or rename;
 * `no-local-embedding` fails a local-only create; `no-embedding-model` fails adding a source;
 * `unsupported-file` and `link-unreachable` fail an add; `reembed-running` fails a model change;
 * `restore-name-taken` fails a base restore.
 */
export const knowledgeDomain = defineMockDomain('knowledge', [
  defineMockHandler({
    method: 'get',
    path: '/orgs/:orgId/knowledge/summary',
    response: okResponse(knowledgeSummaryDtoSchema),
    scenarios: {
      default: () => {
        const live = bases.filter((base) => !base.deletedAt)
        const own = live.flatMap((base) => activeSources(base.id).map(({ dto }) => dto))
        return mockOk({
          knowledgeBases: live.length,
          sources: own.length,
          processing: own.filter(({ status }) => IN_PROGRESS.has(status)).length,
          needsAttention: own.filter(({ status }) => NEEDS_ATTENTION.has(status)).length,
        })
      },
    },
  }),
  defineMockHandler({
    method: 'get',
    path: '/orgs/:orgId/knowledge/recently-deleted',
    response: pageResponse(deletedKnowledgeItemDtoSchema),
    scenarios: {
      default: ({ request }) => {
        const url = new URL(request.url)
        const q = url.searchParams.get('q')?.toLowerCase()
        const kind = url.searchParams.get('kind')
        const purgeAt = (deletedAt: string) =>
          new Date(Date.parse(deletedAt) + KNOWLEDGE_RESTORE_WINDOW_DAYS * DAY_MS).toISOString()
        const deletedBases = bases.flatMap((base) =>
          base.deletedAt
            ? [
                {
                  kind: 'knowledge_base' as const,
                  id: base.id,
                  name: base.name,
                  deletedAt: base.deletedAt,
                  purgeAt: purgeAt(base.deletedAt),
                  deletedBy: MAYA,
                  sourceCount: activeSources(base.id).length,
                  canRestore: true,
                },
              ]
            : [],
        )
        const deletedSources = sources.flatMap(({ dto, deletedBy }) => {
          const base = findBase(dto.knowledgeBaseId)
          return dto.deletedAt && dto.purgeAt && base
            ? [
                {
                  kind: 'source' as const,
                  id: dto.id,
                  name: dto.name,
                  deletedAt: dto.deletedAt,
                  purgeAt: dto.purgeAt,
                  deletedBy,
                  sourceType: dto.type,
                  knowledgeBase: { id: base.id, name: base.name },
                  canRestore: true,
                },
              ]
            : []
        })
        const items = [...deletedBases, ...deletedSources]
          .filter((item) => !kind || item.kind === kind)
          .filter((item) => !q || item.name.toLowerCase().includes(q))
          .sort((a, b) => b.deletedAt.localeCompare(a.deletedAt))
        return page(items, url)
      },
    },
  }),
  defineMockHandler({
    method: 'get',
    path,
    response: pageResponse(knowledgeBaseDtoSchema),
    scenarios: { default: listBases('manage'), 'search-only': listBases('search') },
  }),
  defineMockHandler({
    method: 'post',
    path,
    response: okResponse(knowledgeBaseDtoSchema),
    scenarios: {
      default: async ({ request }) => {
        const input = createKnowledgeBaseInputSchema.parse(await request.json())
        if (nameTaken(input.name)) return nameTakenError()
        const state = baseState({
          id: fixtureUuid(BASE_KIND, bases.length + 10),
          name: input.name,
          description: input.description ?? null,
          isLocalOnly: input.isLocalOnly,
          chunkingPreset: input.chunkingPreset,
          embeddingModel: input.isLocalOnly ? LOCAL_EMBEDDING : CLOUD_EMBEDDING,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        bases = [...bases, state]
        grants.set(state.id, [
          grantFactory({ subjectType: 'user', team: null, user: MAYA, level: 'manage' }),
          ...input.teamIds.flatMap((teamId) => {
            const team = TEAMS.find(({ id }) => id === teamId)
            return team ? [grantFactory({ team, level: 'search' })] : []
          }),
        ])
        return mockOk(toBaseDto(state, 'manage'), { status: 201 })
      },
      'name-taken': () => nameTakenError(),
      'no-local-embedding': () => localRequiredError(),
    },
  }),
  defineMockHandler({
    method: 'get',
    path: basePath,
    response: okResponse(knowledgeBaseDtoSchema),
    scenarios: { default: getBase('manage'), 'search-only': getBase('search') },
  }),
  defineMockHandler({
    method: 'patch',
    path: basePath,
    response: okResponse(knowledgeBaseDtoSchema),
    scenarios: {
      default: async ({ params, request }) => {
        const found = findBase(params.baseId)
        if (!found) return notFound()
        const input = updateKnowledgeBaseInputSchema.parse(await request.json())
        if (input.name && nameTaken(input.name, found.id)) return nameTakenError()
        if (input.isLocalOnly && found.embeddingModel?.dataLocation === 'provider') {
          return localRequiredError()
        }
        let next: BaseState = {
          ...found,
          name: input.name ?? found.name,
          description: input.description === undefined ? found.description : input.description,
          isLocalOnly: input.isLocalOnly ?? found.isLocalOnly,
          chunkingPreset: input.chunkingPreset ?? found.chunkingPreset,
          updatedAt: new Date().toISOString(),
        }
        setBase(next)
        if (input.chunkingPreset && input.chunkingPreset !== found.chunkingPreset) {
          next = startReindex(next, null)
        }
        return mockOk(toBaseDto(next, 'manage'))
      },
      'name-taken': () => nameTakenError(),
    },
  }),
  defineMockHandler({
    method: 'delete',
    path: basePath,
    response: okResponse(z.null()),
    scenarios: {
      default: ({ params }) => {
        const found = findBase(params.baseId)
        if (!found) return notFound()
        setBase({ ...found, deletedAt: new Date().toISOString() })
        return noContent()
      },
    },
  }),
  defineMockHandler({
    method: 'get',
    path: `${basePath}/impact`,
    response: okResponse(knowledgeBaseImpactDtoSchema),
    scenarios: {
      default: ({ params }) => {
        const found = findBase(params.baseId)
        if (!found) return notFound()
        const agents = found.usedByCount > 0 ? SUPPORT_AGENTS : []
        return mockOk({
          sourceCount: activeSources(found.id).length,
          chunkCount: toBaseDto(found, 'manage').chunkCount,
          agentCount: agents.length,
          agents,
          chatCount: found.usedByCount > 0 ? 3 : 0,
          restoreWindowDays: KNOWLEDGE_RESTORE_WINDOW_DAYS,
        })
      },
    },
  }),
  defineMockHandler({
    method: 'post',
    path: `${basePath}/restore`,
    response: okResponse(knowledgeBaseDtoSchema),
    scenarios: {
      default: async ({ params, request }) => {
        const found = bases.find((base) => base.id === params.baseId && base.deletedAt)
        if (!found) return notFound()
        const input = restoreKnowledgeBaseInputSchema.parse(await request.json())
        const name = input.name ?? found.name
        if (nameTaken(name)) return nameTakenError()
        const next = { ...found, name, deletedAt: null }
        setBase(next)
        return mockOk(toBaseDto(next, 'manage'))
      },
      'restore-name-taken': () => nameTakenError(),
    },
  }),
  defineMockHandler({
    method: 'post',
    path: `${basePath}/reindex`,
    response: okResponse(knowledgeBaseDtoSchema),
    scenarios: {
      default: ({ params }) => {
        const found = findBase(params.baseId)
        if (!found) return notFound()
        if (found.reindex) {
          return mockError(HTTP_CONFLICT, ERROR_CODES.KNOWLEDGE_REEMBED_IN_PROGRESS, 'Running')
        }
        return mockOk(toBaseDto(startReindex(found, null), 'manage'), { status: HTTP_ACCEPTED })
      },
    },
  }),
  defineMockHandler({
    method: 'get',
    path: `${basePath}/reindex-impact`,
    response: okResponse(knowledgeReindexImpactDtoSchema),
    scenarios: {
      default: ({ params }) => {
        const found = findBase(params.baseId)
        if (!found) return notFound()
        const chunkCount = toBaseDto(found, 'manage').chunkCount
        return mockOk({
          documentCount: countDocuments(found.id),
          chunkCount,
          estimatedMinutes: Math.max(1, Math.ceil(chunkCount / MINUTE_CHUNKS)),
        })
      },
    },
  }),
  defineMockHandler({
    method: 'put',
    path: `${basePath}/embedding-model`,
    response: okResponse(knowledgeBaseDtoSchema),
    scenarios: {
      default: async ({ params, request }) => {
        const found = findBase(params.baseId)
        if (!found) return notFound()
        const { modelKey } = setKnowledgeEmbeddingModelInputSchema.parse(await request.json())
        const target = EMBEDDINGS.find((model) => model.modelKey === modelKey)
        if (!target) {
          return mockError(
            HTTP_UNPROCESSABLE,
            ERROR_CODES.KNOWLEDGE_EMBEDDING_MODEL_INVALID,
            'Not an embedding model',
          )
        }
        if (found.isLocalOnly && target.dataLocation !== 'local') return localRequiredError()
        if (found.reindex) {
          return mockError(HTTP_CONFLICT, ERROR_CODES.KNOWLEDGE_REEMBED_IN_PROGRESS, 'Running')
        }
        // a base with no model has nothing to re-index: it just starts using the model
        if (!found.embeddingModel) {
          const next = { ...found, embeddingModel: target }
          setBase(next)
          return mockOk(toBaseDto(next, 'manage'), { status: HTTP_ACCEPTED })
        }
        return mockOk(toBaseDto(startReindex(found, target), 'manage'), { status: HTTP_ACCEPTED })
      },
      'reembed-running': () =>
        mockError(HTTP_CONFLICT, ERROR_CODES.KNOWLEDGE_REEMBED_IN_PROGRESS, 'Running'),
    },
  }),
  defineMockHandler({
    method: 'delete',
    path: `${basePath}/embedding-model`,
    response: okResponse(z.null()),
    scenarios: {
      default: ({ params }) => {
        const found = findBase(params.baseId)
        if (!found) return notFound()
        setBase({ ...found, reindex: null })
        return noContent()
      },
    },
  }),
  defineMockHandler({
    method: 'get',
    path: `${basePath}/access`,
    response: okResponse(knowledgeAccessDtoSchema),
    scenarios: {
      default: ({ params }) => {
        const found = findBase(params.baseId)
        if (!found) return notFound()
        return mockOk({
          grants: grants.get(found.id) ?? [],
          isLocalOnly: found.isLocalOnly,
          blockedAgents: found.isLocalOnly ? SUPPORT_AGENTS : [],
        })
      },
    },
  }),
  defineMockHandler({
    method: 'put',
    path: `${basePath}/access`,
    response: okResponse(knowledgeAccessDtoSchema),
    scenarios: {
      default: async ({ params, request }) => {
        const found = findBase(params.baseId)
        if (!found) return notFound()
        const input = setKnowledgeAccessInputSchema.parse(await request.json())
        const next = input.grants.flatMap((grant) => {
          if (grant.subjectType === 'team') {
            const team = TEAMS.find(({ id }) => id === grant.teamId)
            return team ? [grantFactory({ team, level: grant.level })] : []
          }
          const user = PEOPLE.find(({ id }) => id === grant.userId)
          return user
            ? [grantFactory({ subjectType: 'user', team: null, user, level: grant.level })]
            : []
        })
        grants.set(found.id, next)
        touch(found.id)
        return mockOk({
          grants: next,
          isLocalOnly: found.isLocalOnly,
          blockedAgents: found.isLocalOnly ? SUPPORT_AGENTS : [],
        })
      },
    },
  }),
  defineMockHandler({
    method: 'get',
    path: `${basePath}/access/impact`,
    response: okResponse(knowledgeAccessImpactDtoSchema),
    scenarios: {
      default: ({ params, request }) => {
        const found = findBase(params.baseId)
        const teamId = new URL(request.url).searchParams.get('teamId')
        const team = TEAMS.find(({ id }) => id === teamId)
        if (!found || !team) return notFound()
        return mockOk({
          team,
          memberCount: team.id === SUPPORT_TEAM_ID ? 3 : 1,
          agentCount: found.usedByCount,
          agents: found.usedByCount > 0 ? SUPPORT_AGENTS : [],
        })
      },
    },
  }),
  defineMockHandler({
    method: 'post',
    path: `${basePath}/test-search`,
    response: okResponse(knowledgeTestSearchDtoSchema),
    scenarios: {
      default: async ({ params, request }) => {
        const found = findBase(params.baseId)
        if (!found) return notFound()
        const input = knowledgeTestSearchInputSchema.parse(await request.json())
        const teamId = input.searchAs.type === 'team' ? input.searchAs.teamId : null
        const teamCanSearch =
          teamId === null || (grants.get(found.id) ?? []).some(({ team }) => team?.id === teamId)
        const ready = new Set(
          activeSources(found.id)
            .filter(({ dto }) => dto.status === 'ready' || dto.status === 'partially_failed')
            .map(({ dto }) => dto.id),
        )
        const found30 = chunks
          .filter((chunk) => chunk.baseId === found.id && ready.has(chunk.sourceId))
          .map((chunk) => ({ chunk, overlap: score(input.question, chunk.content) }))
          .filter(({ overlap }) => teamCanSearch && overlap > 0)
          .sort((a, b) => b.overlap - a.overlap)
        let usedCount = 0
        const passages = found30.map(({ chunk, overlap }) => {
          const relevance = Math.round(Math.min(1, 0.4 + overlap * 0.6) * 100) / 100
          const isUsed = relevance >= input.minRelevance && usedCount < input.passagesPerAnswer
          if (isUsed) usedCount += 1
          return toPassage(chunk, relevance, isUsed)
        })
        const first = passages.find(({ isUsed }) => isUsed)
        return mockOk({
          answerPreview:
            input.includeAnswer && first
              ? {
                  text: `${first.content.slice(0, MATCH_CONTEXT)} [1]`,
                  modelKey: providerModelKey('openai', 'gpt-4.1-mini'),
                }
              : null,
          passages,
          notSearchedSourceCount: activeSources(found.id).filter(({ dto }) =>
            IN_PROGRESS.has(dto.status),
          ).length,
        })
      },
    },
  }),

  // ── Sources ───────────────────────────────────────────────────────────────────────────────
  defineMockHandler({
    method: 'get',
    path: sourcesPath,
    response: pageResponse(knowledgeSourceDtoSchema),
    scenarios: {
      default: ({ params, request }) => {
        if (!findBase(params.baseId)) return notFound()
        const url = new URL(request.url)
        const q = url.searchParams.get('q')?.toLowerCase()
        const type = url.searchParams.get('type')
        const status = url.searchParams.get('status')
        const sort = url.searchParams.get('sort') ?? '-createdAt'
        sources = sources.map((state) =>
          state.dto.knowledgeBaseId === params.baseId ? advance(state) : state,
        )
        const items = activeSources(String(params.baseId))
          .map(({ dto }) => dto)
          .filter((dto) => !q || dto.name.toLowerCase().includes(q))
          .filter((dto) => !type || dto.type === type)
          .filter((dto) => !status || dto.status === status)
          .sort(directed(sort, sourceComparators[sort.replace('-', '')] ?? byCreatedAt))
        return page(items, url)
      },
    },
  }),
  defineMockHandler({
    method: 'post',
    path: `${sourcesPath}/files`,
    response: okResponse(knowledgeFileUploadDtoSchema),
    scenarios: {
      default: async ({ params, request }) => {
        const found = findBase(params.baseId)
        if (!found) return notFound()
        if (!found.embeddingModel) return noEmbeddingError()
        const input = requestKnowledgeFileUploadInputSchema.parse(await request.json())
        const duplicate = sources.find(
          ({ dto, sha256 }) =>
            dto.knowledgeBaseId === found.id && !dto.deletedAt && sha256 === input.sha256,
        )
        if (duplicate && input.duplicate === 'reject') {
          return mockError(
            HTTP_CONFLICT,
            ERROR_CODES.KNOWLEDGE_DUPLICATE_FILE,
            'Already in this knowledge base',
            {
              details: [
                {
                  existingSource: {
                    id: duplicate.dto.id,
                    name: duplicate.dto.name,
                    createdAt: duplicate.dto.createdAt,
                  },
                },
              ],
            },
          )
        }
        if (duplicate && input.duplicate === 'replace') {
          setSource({
            ...duplicate,
            deletedBy: MAYA,
            dto: {
              ...duplicate.dto,
              deletedAt: new Date().toISOString(),
              purgeAt: new Date(Date.now() + KNOWLEDGE_RESTORE_WINDOW_DAYS * DAY_MS).toISOString(),
            },
          })
        }
        const dto = sourceFactory({
          id: fixtureUuid(SOURCE_KIND, sources.length + 20),
          knowledgeBaseId: found.id,
          name: input.fileName,
          fileName: input.fileName,
          contentType: input.contentType,
          sizeBytes: input.sizeBytes,
          ocrMode: input.ocrMode,
          status: 'uploading',
          progressPercent: 0,
          documentCount: 1,
          passageCount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        sources = [{ dto, deletedBy: null, isFrozen: false, sha256: input.sha256 }, ...sources]
        addDocument(dto, input.fileName, { status: 'pending', chunkCount: 0, indexedAt: null }, [
          'Extracted text appears here once the file is processed.',
        ])
        touch(found.id)
        const origin = new URL(request.url).origin
        return mockOk(
          {
            source: dto,
            upload: {
              url: `${origin}/api/v1/mock-storage/${dto.id}`,
              method: 'PUT' as const,
              headers: {},
              expiresAt: new Date(Date.now() + HOUR_MS).toISOString(),
            },
          },
          { status: 201 },
        )
      },
      'no-embedding-model': () => noEmbeddingError(),
      'unsupported-file': () =>
        mockError(
          HTTP_UNPROCESSABLE,
          ERROR_CODES.KNOWLEDGE_FILE_UNSUPPORTED,
          'This file type is not supported',
        ),
    },
  }),
  defineMockHandler({
    method: 'put',
    path: '/mock-storage/:sourceId',
    response: okResponse(z.null()),
    scenarios: { default: () => noContent() },
  }),
  defineMockHandler({
    method: 'post',
    path: `${sourcesPath}/links`,
    response: okResponse(knowledgeSourceDtoSchema),
    scenarios: {
      default: async ({ params, request }) => {
        const found = findBase(params.baseId)
        if (!found) return notFound()
        if (!found.embeddingModel) return noEmbeddingError()
        const { name, ...link } = createKnowledgeLinkInputSchema.parse(await request.json())
        const dto = sourceFactory({
          id: fixtureUuid(SOURCE_KIND, sources.length + 20),
          knowledgeBaseId: found.id,
          type: 'link',
          name: name ?? new URL(link.url).hostname,
          fileName: null,
          contentType: null,
          sizeBytes: null,
          link,
          status: 'queued',
          progressPercent: 0,
          documentCount: 0,
          passageCount: 0,
          nextSyncAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        sources = [{ dto, deletedBy: null, isFrozen: false, sha256: null }, ...sources]
        touch(found.id)
        return mockOk(dto, { status: 201 })
      },
      'no-embedding-model': () => noEmbeddingError(),
      'link-unreachable': ({ params }) => {
        const found = findBase(params.baseId)
        if (!found) return notFound()
        const dto = sourceFactory({
          id: fixtureUuid(SOURCE_KIND, sources.length + 20),
          knowledgeBaseId: found.id,
          type: 'link',
          name: 'unreachable.example.com',
          status: 'failed',
          errorCode: 'KNOWLEDGE_LINK_UNREACHABLE',
          documentCount: 0,
          passageCount: 0,
        })
        sources = [{ dto, deletedBy: null, isFrozen: true, sha256: null }, ...sources]
        return mockOk(dto, { status: 201 })
      },
    },
  }),
  defineMockHandler({
    method: 'post',
    path: `${sourcesPath}/bulk`,
    response: okResponse(bulkKnowledgeSourcesResultDtoSchema),
    scenarios: {
      default: async ({ params, request }) => {
        if (!findBase(params.baseId)) return notFound()
        const input = bulkKnowledgeSourcesInputSchema.parse(await request.json())
        let affected = 0
        for (const id of input.sourceIds) {
          const state = findSource(params.baseId, id)
          if (!state || state.dto.deletedAt) continue
          affected += 1
          setSource(
            input.action === 'remove'
              ? {
                  ...state,
                  deletedBy: MAYA,
                  dto: {
                    ...state.dto,
                    deletedAt: new Date().toISOString(),
                    purgeAt: new Date(
                      Date.now() + KNOWLEDGE_RESTORE_WINDOW_DAYS * DAY_MS,
                    ).toISOString(),
                  },
                }
              : {
                  ...state,
                  isFrozen: false,
                  dto: { ...state.dto, status: 'queued', progressPercent: 0, errorCode: null },
                },
          )
        }
        touch(String(params.baseId))
        return mockOk({ affected, skipped: input.sourceIds.length - affected })
      },
    },
  }),
  defineMockHandler({
    method: 'get',
    path: `${sourcesPath}/:sourceId`,
    response: okResponse(knowledgeSourceDtoSchema),
    scenarios: {
      default: ({ params }) => {
        const found = findSource(params.baseId, params.sourceId)
        return found ? mockOk(found.dto) : sourceNotFound()
      },
    },
  }),
  defineMockHandler({
    method: 'patch',
    path: `${sourcesPath}/:sourceId`,
    response: okResponse(knowledgeSourceDtoSchema),
    scenarios: {
      default: async ({ params, request }) => {
        const found = findSource(params.baseId, params.sourceId)
        if (!found || found.dto.deletedAt) return sourceNotFound()
        const input = updateKnowledgeSourceInputSchema.parse(await request.json())
        const dto: KnowledgeSourceDto = {
          ...found.dto,
          name: input.name ?? found.dto.name,
          ocrMode: input.ocrMode ?? found.dto.ocrMode,
          link:
            found.dto.link && input.link ? { ...found.dto.link, ...input.link } : found.dto.link,
          updatedAt: new Date().toISOString(),
        }
        setSource({ ...found, dto })
        return mockOk(dto)
      },
    },
  }),
  defineMockHandler({
    method: 'delete',
    path: `${sourcesPath}/:sourceId`,
    response: okResponse(z.null()),
    scenarios: {
      default: ({ params }) => {
        const found = findSource(params.baseId, params.sourceId)
        if (!found || found.dto.deletedAt) return sourceNotFound()
        const deletedAt = new Date()
        setSource({
          ...found,
          deletedBy: MAYA,
          dto: {
            ...found.dto,
            deletedAt: deletedAt.toISOString(),
            purgeAt: new Date(
              deletedAt.getTime() + KNOWLEDGE_RESTORE_WINDOW_DAYS * DAY_MS,
            ).toISOString(),
          },
        })
        touch(String(params.baseId))
        return noContent()
      },
    },
  }),
  defineMockHandler({
    method: 'post',
    path: `${sourcesPath}/:sourceId/restore`,
    response: okResponse(knowledgeSourceDtoSchema),
    scenarios: {
      default: ({ params }) => {
        const found = findSource(params.baseId, params.sourceId)
        if (!found?.dto.deletedAt) return sourceNotFound()
        if (!findBase(params.baseId)) {
          return mockError(HTTP_CONFLICT, ERROR_CODES.KNOWLEDGE_BASE_DELETED, 'Base is deleted')
        }
        const dto = { ...found.dto, deletedAt: null, purgeAt: null }
        setSource({ ...found, deletedBy: null, dto })
        return mockOk(dto)
      },
    },
  }),
  defineMockHandler({
    method: 'post',
    path: `${sourcesPath}/:sourceId/complete`,
    response: okResponse(knowledgeSourceDtoSchema),
    scenarios: {
      default: ({ params }) => {
        const found = findSource(params.baseId, params.sourceId)
        if (found?.dto.status !== 'uploading') return sourceStateInvalid()
        const dto: KnowledgeSourceDto = { ...found.dto, status: 'queued', progressPercent: 0 }
        setSource({ ...found, dto })
        return mockOk(dto)
      },
    },
  }),
  defineMockHandler({
    method: 'post',
    path: `${sourcesPath}/:sourceId/retry`,
    response: okResponse(knowledgeSourceDtoSchema),
    scenarios: {
      default: async ({ params, request }) => {
        const found = findSource(params.baseId, params.sourceId)
        if (!found || found.dto.deletedAt) return sourceNotFound()
        if (!NEEDS_ATTENTION.has(found.dto.status)) return sourceStateInvalid()
        const input = retryKnowledgeSourceInputSchema.parse(await request.json())
        const dto: KnowledgeSourceDto = {
          ...found.dto,
          status: 'queued',
          progressPercent: 0,
          errorCode: null,
          failedDocumentCount: 0,
          ocrMode: input.withOcr ? 'force' : found.dto.ocrMode,
        }
        setSource({ ...found, isFrozen: false, dto })
        return mockOk(dto)
      },
    },
  }),
  defineMockHandler({
    method: 'post',
    path: `${sourcesPath}/:sourceId/sync`,
    response: okResponse(knowledgeSourceDtoSchema),
    scenarios: {
      default: ({ params }) => {
        const found = findSource(params.baseId, params.sourceId)
        if (!found || found.dto.deletedAt) return sourceNotFound()
        if (found.dto.type === 'file') return sourceStateInvalid()
        const dto: KnowledgeSourceDto = { ...found.dto, status: 'queued', progressPercent: 0 }
        setSource({ ...found, isFrozen: false, dto })
        return mockOk(dto)
      },
    },
  }),
  defineMockHandler({
    method: 'get',
    path: `${sourcesPath}/:sourceId/documents`,
    response: pageResponse(knowledgeDocumentDtoSchema),
    scenarios: {
      default: ({ params, request }) => {
        if (!findSource(params.baseId, params.sourceId)) return sourceNotFound()
        const url = new URL(request.url)
        const status = url.searchParams.get('status')
        return page(
          documents.filter(
            (document) =>
              document.sourceId === params.sourceId && (!status || document.status === status),
          ),
          url,
        )
      },
    },
  }),
  defineMockHandler({
    method: 'get',
    path: `${documentsPath}/:documentId`,
    response: okResponse(knowledgeDocumentDetailDtoSchema),
    scenarios: {
      default: ({ params }) => {
        const document = documents.find((item) => item.id === params.documentId)
        const source = document && findSource(params.baseId, document.sourceId)
        if (!document || !source) {
          return mockError(
            HTTP_NOT_FOUND,
            ERROR_CODES.KNOWLEDGE_DOCUMENT_NOT_FOUND,
            'Document not found',
          )
        }
        const baseGrants = grants.get(String(params.baseId)) ?? []
        return mockOk({
          document,
          source: { id: source.dto.id, name: source.dto.name, type: source.dto.type },
          whoCanSearch: {
            teams: baseGrants.flatMap(({ team }) => (team ? [team] : [])),
            userCount: baseGrants.filter(({ user }) => user).length,
          },
          canDownload: source.dto.type === 'file',
        })
      },
    },
  }),
  defineMockHandler({
    method: 'get',
    path: `${documentsPath}/:documentId/pages`,
    response: pageResponse(knowledgeDocumentPageDtoSchema),
    scenarios: {
      default: ({ params, request }) => {
        const texts = pageTexts.get(String(params.documentId))
        if (!texts) {
          return mockError(
            HTTP_NOT_FOUND,
            ERROR_CODES.KNOWLEDGE_DOCUMENT_NOT_FOUND,
            'Document not found',
          )
        }
        const own = chunks.filter((chunk) => chunk.documentId === params.documentId)
        return page(
          texts.map((text, index) => {
            const chunk = own[index]
            return {
              page: index + 1,
              text,
              passages: chunk
                ? [
                    {
                      chunkId: chunk.chunkId,
                      ordinal: index,
                      start: 0,
                      end: Math.min(text.length, chunk.content.length),
                    },
                  ]
                : [],
            }
          }),
          new URL(request.url),
        )
      },
    },
  }),
  defineMockHandler({
    method: 'post',
    path: `${documentsPath}/:documentId/download`,
    response: okResponse(knowledgeDocumentDownloadDtoSchema),
    scenarios: {
      default: ({ params }) => {
        const document = documents.find((item) => item.id === params.documentId)
        if (!document) {
          return mockError(
            HTTP_NOT_FOUND,
            ERROR_CODES.KNOWLEDGE_DOCUMENT_NOT_FOUND,
            'Document not found',
          )
        }
        return mockOk({
          url: `https://storage.acme.test/knowledge/${document.id}`,
          fileName: document.title,
          contentType: document.mimeType ?? 'application/octet-stream',
          sizeBytes: document.sizeBytes,
          expiresAt: new Date(Date.now() + HOUR_MS).toISOString(),
        })
      },
    },
  }),
])
