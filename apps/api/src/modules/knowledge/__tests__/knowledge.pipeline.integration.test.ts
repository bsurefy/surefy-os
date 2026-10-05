// SPDX-License-Identifier: AGPL-3.0-only
import { randomUUID } from 'node:crypto'

import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { QUEUES } from '@/constants/queues.js'
import { knowledgeBases, knowledgeChunks, vaultModels } from '@/database/tables/index.js'
import { MlUnsupportedFileError } from '@/integrations/ml/index.js'
import {
  ERROR_CODES,
  knowledgeDocumentDetailDtoSchema,
  knowledgeDocumentDtoSchema,
  knowledgeDocumentPageDtoSchema,
  knowledgeFileUploadDtoSchema,
  knowledgeSourceDtoSchema,
  knowledgeTestSearchDtoSchema,
  notificationDtoSchema,
} from '@surefy/contracts'

import { setupTwoOrgs, type TwoOrgSetup } from '../../../../test/helpers/orgSetup.js'
import { expectData, expectError, expectPage, request } from '../../../../test/helpers/request.js'
import {
  as,
  enableProxyModel,
  orgUrl,
  send,
  tenantOf,
  thread,
} from '../../chats/__tests__/chatsTestKit.js'
import { KNOWLEDGE_JOBS } from '../knowledge.constants.js'
import {
  basesUrl,
  createBase,
  createFakeFiles,
  createFakeMl,
  LEAVE_DOCUMENT,
  seedEmbeddingModel,
  sha256Hex,
  type FakeFiles,
  type Who,
} from './knowledgeTestKit.js'
import { callContextOf } from '../knowledgeRetrieval/knowledgeSearch.service.js'

const FILE_BYTES = Buffer.from('%PDF-1.7 the leave policy')

const call = (
  setup: TwoOrgSetup,
  who: Who,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  payload?: unknown,
  query?: Record<string, string>,
) =>
  request(setup.app, method, path, {
    headers: setup.sessionOf(setup.a.members[who]),
    ...(payload === undefined ? {} : { payload }),
    ...(query === undefined ? {} : { query }),
  })

const uploadPayload = (over: Record<string, unknown> = {}) => ({
  fileName: 'leave-policy.pdf',
  contentType: 'application/pdf',
  sizeBytes: FILE_BYTES.length,
  sha256: sha256Hex(FILE_BYTES),
  ...over,
})

const queuedJobs = async (setup: TwoOrgSetup, name: string) =>
  (await setup.container.queues.get(QUEUES.KNOWLEDGE_INGESTION).getJobs(['waiting', 'delayed']))
    .filter((job) => job.name === name)
    .map((job) => job.data as Record<string, string>)

/** An organization with an embedding model and a base, over a fake storage and a fake ML service. */
async function setupKnowledge(ml = createFakeMl(LEAVE_DOCUMENT)) {
  const files = createFakeFiles()
  const setup = await setupTwoOrgs({ ml, knowledge: { files } })
  const modelKey = await seedEmbeddingModel(setup)
  const base = await createBase(setup, 'adam')
  return { setup, files, ml, modelKey, base }
}

/** A second embedding model of the same size, as if the organization had added another. */
async function addEmbeddingModel(
  setup: TwoOrgSetup,
  from: string,
  modelKey: string,
  displayName: string,
): Promise<void> {
  await setup.db.tenant(setup.a.id, async (tx) => {
    const [original] = await tx
      .select()
      .from(vaultModels)
      .where(and(eq(vaultModels.organizationId, setup.a.id), eq(vaultModels.modelKey, from)))
    if (original === undefined) throw new Error('no embedding model')
    await tx.insert(vaultModels).values({
      organizationId: setup.a.id,
      modelKey,
      displayName,
      providerKey: original.providerKey,
      providerModelId: original.providerModelId,
      type: 'embedding',
      source: original.source,
      embeddingDimensions: original.embeddingDimensions,
      isEnabled: true,
      status: 'available',
    })
  })
}

/** Adds the leave policy file the way the browser does: request, upload, complete. */
async function addFile(
  setup: TwoOrgSetup,
  files: FakeFiles,
  baseId: string,
  over: Record<string, unknown> = {},
) {
  const created = expectData(
    await call(
      setup,
      'adam',
      'POST',
      basesUrl(setup.a.id, `/${baseId}/sources/files`),
      uploadPayload(over),
    ),
    201,
    knowledgeFileUploadDtoSchema,
  )
  const key = files.uploads.at(-1)
  if (key === undefined) throw new Error('no upload was signed')
  files.objects.set(key, FILE_BYTES) // the browser's PUT to storage
  const source = expectData(
    await call(
      setup,
      'adam',
      'POST',
      basesUrl(setup.a.id, `/${baseId}/sources/${created.source.id}/complete`),
    ),
    200,
    knowledgeSourceDtoSchema,
  )
  const [job] = await queuedJobs(setup, KNOWLEDGE_JOBS.INGEST_DOCUMENT)
  return { created, source, key, documentId: job?.documentId }
}

const getSource = async (setup: TwoOrgSetup, baseId: string, sourceId: string) =>
  expectData(
    await call(setup, 'adam', 'GET', basesUrl(setup.a.id, `/${baseId}/sources/${sourceId}`)),
    200,
    knowledgeSourceDtoSchema,
  )

describe('uploading a file', () => {
  it('signs an upload, verifies the stored bytes, and queues the document', async () => {
    const { setup, files, base } = await setupKnowledge()
    const { created, source, key, documentId } = await addFile(setup, files, base.id)
    expect(created.source).toMatchObject({
      type: 'file',
      status: 'uploading',
      fileName: 'leave-policy.pdf',
      ocrMode: 'auto',
    })
    expect(created.upload).toMatchObject({ method: 'PUT' })
    expect(created.upload.url).toContain(key)
    expect(key).toMatch(new RegExp(`^orgs/${setup.a.id}/knowledge/[0-9a-f-]{36}/source$`))
    expect(source).toMatchObject({ status: 'queued', progressPercent: 0 })
    expect(documentId).toBeDefined()
  })

  it('fails a source whose stored bytes do not match the hash, and removes the file', async () => {
    const { setup, files, base } = await setupKnowledge()
    const created = expectData(
      await call(
        setup,
        'adam',
        'POST',
        basesUrl(setup.a.id, `/${base.id}/sources/files`),
        uploadPayload(),
      ),
      201,
      knowledgeFileUploadDtoSchema,
    )
    const key = files.uploads.at(-1) ?? ''
    // nothing uploaded yet
    expectError(
      await call(
        setup,
        'adam',
        'POST',
        basesUrl(setup.a.id, `/${base.id}/sources/${created.source.id}/complete`),
      ),
      409,
      ERROR_CODES.KNOWLEDGE_SOURCE_STATE_INVALID,
    )
    files.objects.set(key, Buffer.from('tampered bytes!!!!!!!!!!'))
    const failed = expectData(
      await call(
        setup,
        'adam',
        'POST',
        basesUrl(setup.a.id, `/${base.id}/sources/${created.source.id}/complete`),
      ),
      200,
      knowledgeSourceDtoSchema,
    )
    expect(failed).toMatchObject({
      status: 'failed',
      errorCode: ERROR_CODES.KNOWLEDGE_UPLOAD_CORRUPTED,
    })
    expect(files.deleted).toContain(key)
    expect(await queuedJobs(setup, KNOWLEDGE_JOBS.INGEST_DOCUMENT)).toEqual([])
  })

  it('answers 409 for the same bytes, and replaces or keeps both on request', async () => {
    const { setup, files, base } = await setupKnowledge()
    const first = await addFile(setup, files, base.id)
    const url = basesUrl(setup.a.id, `/${base.id}/sources/files`)
    const error = expectError(
      await call(setup, 'adam', 'POST', url, uploadPayload()),
      409,
      ERROR_CODES.KNOWLEDGE_DUPLICATE_FILE,
    )
    expect(error.details[0]).toMatchObject({ existingSource: { id: first.created.source.id } })

    const replaced = expectData(
      await call(setup, 'adam', 'POST', url, uploadPayload({ duplicate: 'replace' })),
      201,
      knowledgeFileUploadDtoSchema,
    )
    const active = expectPage(
      await call(setup, 'adam', 'GET', basesUrl(setup.a.id, `/${base.id}/sources`)),
      knowledgeSourceDtoSchema,
    ).data
    expect(active.map((s) => s.id)).toEqual([replaced.source.id])
    const deleted = expectPage(
      await call(setup, 'adam', 'GET', basesUrl(setup.a.id, `/${base.id}/sources`), undefined, {
        state: 'deleted',
      }),
      knowledgeSourceDtoSchema,
    ).data
    expect(deleted.map((s) => s.id)).toEqual([first.created.source.id])

    expectData(
      await call(setup, 'adam', 'POST', url, uploadPayload({ duplicate: 'keep_both' })),
      201,
      knowledgeFileUploadDtoSchema,
    )
    expect(
      expectPage(
        await call(setup, 'adam', 'GET', basesUrl(setup.a.id, `/${base.id}/sources`)),
        knowledgeSourceDtoSchema,
      ).data,
    ).toHaveLength(2)
  })
})

describe('ingestion', () => {
  it('parses, chunks, embeds and stores, then notifies the person who added the file', async () => {
    const { setup, files, ml, modelKey, base } = await setupKnowledge()
    const { created, documentId } = await addFile(setup, files, base.id)
    if (documentId === undefined) throw new Error('no document was queued')
    const { ingestion } = setup.container.modules.knowledge

    await ingestion.ingestDocument(setup.a.id, documentId, { resume: false })

    expect(ml.calls).toHaveLength(1)
    expect(ml.calls[0]).toMatchObject({
      mimeType: 'application/pdf',
      orgId: setup.a.id,
      ocr: 'auto',
    })
    expect(ml.calls[0]?.fileUrl).toContain(`/${documentId}/source`)
    expect(files.objects.has(`orgs/${setup.a.id}/knowledge/${documentId}/parsed.json`)).toBe(true)

    const source = await getSource(setup, base.id, created.source.id)
    expect(source).toMatchObject({
      status: 'ready',
      progressPercent: 100,
      errorCode: null,
      documentCount: 1,
      failedDocumentCount: 0,
      passageCount: 2,
    })
    const refreshed = expectData(
      await call(setup, 'adam', 'GET', basesUrl(setup.a.id, `/${base.id}`)),
      200,
      (await import('@surefy/contracts')).knowledgeBaseDtoSchema,
    )
    expect(refreshed).toMatchObject({
      sourceCount: 1,
      documentCount: 1,
      chunkCount: 2,
      processing: { ready: 1, inProgress: 0, needsAttention: 0 },
    })
    const chunks = await setup.db.tenant(setup.a.id, (tx) =>
      tx.select().from(knowledgeChunks).where(eq(knowledgeChunks.documentId, documentId)),
    )
    expect(chunks.map((c) => c.headingPath)).toEqual([
      ['Leave', 'Annual leave'],
      ['Leave', 'Parental leave'],
    ])
    expect(
      chunks.every((c) => c.embeddingModel === modelKey && c.embeddingDimensions === 1536),
    ).toBe(true)

    const notifications = expectPage(
      await call(setup, 'adam', 'GET', `/api/v1/orgs/${setup.a.id}/notifications`),
      notificationDtoSchema,
    ).data
    expect(notifications.map((n) => n.type)).toContain('knowledge_source.ready')

    // the second run finds the document ready and the claim fails: nothing is parsed again
    await ingestion.ingestDocument(setup.a.id, documentId, { resume: false })
    expect(ml.calls).toHaveLength(1)
  })

  it('shows the preview text by page, with where each passage sits', async () => {
    const { setup, files, base } = await setupKnowledge()
    const { documentId } = await addFile(setup, files, base.id)
    if (documentId === undefined) throw new Error('no document was queued')
    await setup.container.modules.knowledge.ingestion.ingestDocument(setup.a.id, documentId, {
      resume: false,
    })
    const detail = expectData(
      await call(setup, 'adam', 'GET', basesUrl(setup.a.id, `/${base.id}/documents/${documentId}`)),
      200,
      knowledgeDocumentDetailDtoSchema,
    )
    expect(detail).toMatchObject({
      document: { status: 'ready', chunkCount: 2, pageCount: 2 },
      canDownload: true,
    })
    const pages = expectPage(
      await call(
        setup,
        'adam',
        'GET',
        basesUrl(setup.a.id, `/${base.id}/documents/${documentId}/pages`),
      ),
      knowledgeDocumentPageDtoSchema,
    ).data
    expect(pages.map((p) => p.page)).toEqual([1, 2])
    expect(pages[0]?.text).toContain('twenty-five days')
    expect(pages[0]?.passages).toHaveLength(1)
    const download = await call(
      setup,
      'adam',
      'POST',
      basesUrl(setup.a.id, `/${base.id}/documents/${documentId}/download`),
    )
    expect(download.statusCode).toBe(200)
  })

  it('fails an unsupported file with its reason, and goes back through ingestion on retry', async () => {
    const ml = createFakeMl(() => {
      throw new MlUnsupportedFileError('no', 'ML_UNSUPPORTED_FILE')
    })
    const { setup, files, base } = await setupKnowledge(ml)
    const { created, documentId } = await addFile(setup, files, base.id)
    if (documentId === undefined) throw new Error('no document was queued')
    const { ingestion } = setup.container.modules.knowledge

    await expect(
      ingestion.ingestDocument(setup.a.id, documentId, { resume: false }),
    ).rejects.toBeInstanceOf(MlUnsupportedFileError)
    await ingestion.failDocument(setup.a.id, documentId, ERROR_CODES.KNOWLEDGE_FILE_UNSUPPORTED)
    const failed = await getSource(setup, base.id, created.source.id)
    expect(failed).toMatchObject({
      status: 'failed',
      errorCode: ERROR_CODES.KNOWLEDGE_FILE_UNSUPPORTED,
      failedDocumentCount: 1,
    })
    const documents = expectPage(
      await call(
        setup,
        'adam',
        'GET',
        basesUrl(setup.a.id, `/${base.id}/sources/${created.source.id}/documents`),
      ),
      knowledgeDocumentDtoSchema,
    ).data
    expect(documents[0]).toMatchObject({
      status: 'failed',
      errorCode: ERROR_CODES.KNOWLEDGE_FILE_UNSUPPORTED,
    })

    const retried = expectData(
      await call(
        setup,
        'adam',
        'POST',
        basesUrl(setup.a.id, `/${base.id}/sources/${created.source.id}/retry`),
        { withOcr: true },
      ),
      200,
      knowledgeSourceDtoSchema,
    )
    expect(retried).toMatchObject({ status: 'queued', errorCode: null, ocrMode: 'force' })
    expect(
      (await queuedJobs(setup, KNOWLEDGE_JOBS.INGEST_DOCUMENT)).map((j) => j.documentId),
    ).toEqual([documentId, documentId])
    expectError(
      await call(
        setup,
        'adam',
        'POST',
        basesUrl(setup.a.id, `/${base.id}/sources/${created.source.id}/retry`),
        {},
      ),
      409,
      ERROR_CODES.KNOWLEDGE_SOURCE_STATE_INVALID,
    )
  })
})

describe('retrieval', () => {
  const ask = (setup: TwoOrgSetup, who: Who, baseId: string, question: string) =>
    setup.container.modules.knowledge.retrieval.retrieve({
      orgId: setup.a.id,
      who: {
        userId: setup.a.members[who].id,
        role: setup.a.members[who].role,
        teamIds: [],
      },
      question,
      baseIds: [baseId],
      answeringModelIsLocal: false,
      call: callContextOf(
        { orgId: setup.a.id, userId: setup.a.members[who].id, teamIds: [], role: null },
        'test',
      ),
    })

  async function ingested() {
    const kit = await setupKnowledge()
    const { documentId } = await addFile(kit.setup, kit.files, kit.base.id)
    if (documentId === undefined) throw new Error('no document was queued')
    await kit.setup.container.modules.knowledge.ingestion.ingestDocument(
      kit.setup.a.id,
      documentId,
      {
        resume: false,
      },
    )
    return { ...kit, documentId }
  }

  it('finds the passage with the question words, ranks it first, and marks what is used', async () => {
    const { setup, base } = await ingested()
    const result = await ask(setup, 'adam', base.id, 'How many days of annual leave do I get?')
    expect(result.passages.length).toBeGreaterThanOrEqual(1)
    const [top] = result.passages
    expect(top?.content).toContain('twenty-five days')
    expect(top).toMatchObject({
      documentTitle: 'leave-policy.pdf',
      sourceName: 'leave-policy.pdf',
      pageFrom: 1,
    })
    expect(top?.isUsed).toBe(true)
    expect(top?.relevance).toBeGreaterThan(0)
    expect(result.notSearchedSourceCount).toBe(0)
  })

  it('serves Test search to managers: passages with relevance, as the person or as a team', async () => {
    const { setup, base } = await ingested()
    const url = basesUrl(setup.a.id, `/${base.id}/test-search`)
    const found = expectData(
      await call(setup, 'adam', 'POST', url, {
        question: 'parental leave weeks',
        includeAnswer: false,
        passagesPerAnswer: 1,
      }),
      200,
      knowledgeTestSearchDtoSchema,
    )
    expect(found.answerPreview).toBeNull()
    expect(found.passages[0]).toMatchObject({
      isUsed: true,
      headingPath: ['Leave', 'Parental leave'],
    })
    expect(found.passages.filter((p) => p.isUsed)).toHaveLength(1)

    // a team with no grant finds nothing
    const team = expectData(
      await call(setup, 'adam', 'POST', `/api/v1/orgs/${setup.a.id}/teams`, {
        name: 'Outsiders',
        memberUserIds: [],
      }),
      201,
      (await import('@surefy/contracts')).teamDtoSchema,
    )
    const asTeam = expectData(
      await call(setup, 'adam', 'POST', url, {
        question: 'annual leave',
        includeAnswer: false,
        searchAs: { type: 'team', teamId: team.id },
      }),
      200,
      knowledgeTestSearchDtoSchema,
    )
    expect(asTeam.passages).toEqual([])
    expectError(
      await call(setup, 'uma', 'POST', url, { question: 'annual leave' }),
      403,
      ERROR_CODES.ACCESS_FORBIDDEN,
    )
  })

  it('filters before ranking: no grant, a removed source and local-only bases return nothing', async () => {
    const { setup, base } = await ingested()
    // Uma has no grant on the base
    expect((await ask(setup, 'uma', base.id, 'annual leave days')).passages).toEqual([])

    // a "Local models only" base is skipped for a cloud answering model, and said so
    await setup.db.tenant(setup.a.id, (tx) =>
      tx.update(knowledgeBases).set({ isLocalOnly: true }).where(eq(knowledgeBases.id, base.id)),
    )
    const skipped = await ask(setup, 'adam', base.id, 'annual leave days')
    expect(skipped.passages).toEqual([])
    expect(skipped.skippedLocalOnly).toEqual([{ id: base.id, name: 'HR Policies' }])
    await setup.db.tenant(setup.a.id, (tx) =>
      tx.update(knowledgeBases).set({ isLocalOnly: false }).where(eq(knowledgeBases.id, base.id)),
    )
    expect(
      (await ask(setup, 'adam', base.id, 'annual leave days')).passages.length,
    ).toBeGreaterThan(0)

    // removing the source hides its passages at once; restoring brings them back without re-indexing
    const [source] = expectPage(
      await call(setup, 'adam', 'GET', basesUrl(setup.a.id, `/${base.id}/sources`)),
      knowledgeSourceDtoSchema,
    ).data
    if (source === undefined) throw new Error('no source')
    const sourceUrl = basesUrl(setup.a.id, `/${base.id}/sources/${source.id}`)
    expect((await call(setup, 'adam', 'DELETE', sourceUrl)).statusCode).toBe(204)
    expect((await ask(setup, 'adam', base.id, 'annual leave days')).passages).toEqual([])
    const refreshed = await setup.db.tenant(setup.a.id, (tx) =>
      tx.select().from(knowledgeBases).where(eq(knowledgeBases.id, base.id)),
    )
    expect(refreshed[0]).toMatchObject({ sourceCount: 0, documentCount: 0, chunkCount: 0 })
    expectData(
      await call(setup, 'adam', 'POST', `${sourceUrl}/restore`),
      200,
      knowledgeSourceDtoSchema,
    )
    expect(
      (await ask(setup, 'adam', base.id, 'annual leave days')).passages.length,
    ).toBeGreaterThan(0)

    // a deleted base is not searched either
    expect(
      (await call(setup, 'adam', 'DELETE', basesUrl(setup.a.id, `/${base.id}`))).statusCode,
    ).toBe(204)
    expect((await ask(setup, 'adam', base.id, 'annual leave days')).passages).toEqual([])
  })

  describe('in chat', () => {
    const QUESTION = 'How many days of annual leave do I get?'
    const askInChat = async (setup: TwoOrgSetup, who: 'adam' | 'uma') => {
      const chatId = randomUUID()
      const response = await send(
        setup,
        chatId,
        { trigger: 'submit', text: QUESTION, attachmentIds: [] },
        who,
      )
      expect(response.statusCode).toBe(200)
      const answer = (await thread(setup, chatId, who)).find(
        (message) => message.role === 'assistant',
      )
      if (answer === undefined) throw new Error('no answer was stored')
      return { chatId, answer }
    }
    const sourceParts = (answer: { parts: { parts: { type: string }[] } }) =>
      answer.parts.parts.filter((part) => part.type === 'source') as unknown as {
        index: number
        kind: string
        title: string
        snippet: string
      }[]
    const previewOf = async (
      setup: TwoOrgSetup,
      who: 'adam' | 'uma',
      chatId: string,
      messageId: string,
    ) =>
      (
        await request(
          setup.app,
          'GET',
          orgUrl(setup, `/chats/${chatId}/messages/${messageId}/sources/1`),
          {
            headers: as(setup, who),
          },
        )
      ).json<{ data: { status: string; passage: string | null; canOpenInKnowledge: boolean } }>()
        .data

    it('answers with the passage a person may read as a numbered source, and checks it again on preview', async () => {
      const { setup } = await ingested()
      await enableProxyModel(setup)
      const { chatId, answer } = await askInChat(setup, 'adam')

      const [source] = sourceParts(answer)
      expect(source).toMatchObject({ index: 1, kind: 'knowledge', title: 'leave-policy.pdf' })
      expect(source?.snippet).toContain('twenty-five days')
      const preview = await previewOf(setup, 'adam', chatId, answer.id)
      expect(preview).toMatchObject({ status: 'available', canOpenInKnowledge: true })
      expect(preview.passage).toContain('twenty-five days')
    })

    it('finds nothing for a person the base is not shared with', async () => {
      const { setup } = await ingested()
      await enableProxyModel(setup)
      const { answer } = await askInChat(setup, 'uma')
      expect(sourceParts(answer)).toEqual([])
    })

    it('reads a cited source as removed once its base is deleted, and as no access for someone who may not read it', async () => {
      const { setup, base } = await ingested()
      await enableProxyModel(setup)
      const { chatId, answer } = await askInChat(setup, 'adam')
      const [source] = sourceParts(answer) as unknown as { chunkId: string; documentId: string }[]
      if (source === undefined) throw new Error('the answer has no source')
      const lookup = {
        type: 'source' as const,
        index: 1,
        kind: 'knowledge' as const,
        knowledgeBaseId: base.id,
        documentId: source.documentId,
        chunkId: source.chunkId,
        title: 'leave-policy.pdf',
        snippet: 'x',
      }
      const { chatRetrieval } = setup.container.modules.knowledge

      // Uma has no grant on the base
      expect(
        await chatRetrieval.checkSource({ ctx: await tenantOf(setup, 'uma'), source: lookup }),
      ).toMatchObject({ status: 'no_access', passage: null, canOpenInKnowledge: false })

      await setup.db.tenant(setup.a.id, (tx) =>
        tx
          .update(knowledgeBases)
          .set({ deletedAt: new Date() })
          .where(eq(knowledgeBases.id, base.id)),
      )
      expect(await previewOf(setup, 'adam', chatId, answer.id)).toMatchObject({
        status: 'removed',
        passage: null,
      })
    })
  })
})

describe('re-embedding', () => {
  it('embeds with the target model next to the old passages, then swaps atomically', async () => {
    const { setup, files, base, modelKey } = await setupKnowledge()
    const { documentId } = await addFile(setup, files, base.id)
    if (documentId === undefined) throw new Error('no document was queued')
    const knowledge = setup.container.modules.knowledge
    await knowledge.ingestion.ingestDocument(setup.a.id, documentId, { resume: false })

    // a second embedding model of the same size
    const target = 'openai/text-embedding-3-small-b'
    await addEmbeddingModel(setup, modelKey, target, 'Embedding B')
    const url = basesUrl(setup.a.id, `/${base.id}/embedding-model`)
    const impact = expectData(
      await call(
        setup,
        'adam',
        'GET',
        basesUrl(setup.a.id, `/${base.id}/reindex-impact`),
        undefined,
        {
          modelKey: target,
        },
      ),
      200,
      (await import('@surefy/contracts')).knowledgeReindexImpactDtoSchema,
    )
    expect(impact).toMatchObject({ documentCount: 1, chunkCount: 2, estimatedMinutes: 1 })
    const started = await call(setup, 'adam', 'PUT', url, { modelKey: target })
    expect(started.statusCode).toBe(202)
    expect(
      started.json<{ data: { reindex: { target: { modelKey: string } } } }>().data.reindex.target
        .modelKey,
    ).toBe(target)
    expect(await queuedJobs(setup, KNOWLEDGE_JOBS.REEMBED_BASE)).toEqual([
      { orgId: setup.a.id, baseId: base.id },
    ])
    expectError(
      await call(setup, 'adam', 'PUT', url, { modelKey: modelKey }),
      409,
      ERROR_CODES.KNOWLEDGE_REEMBED_IN_PROGRESS,
    )

    await knowledge.reembed.reembedBase(setup.a.id, base.id)

    const rows = await setup.db.tenant(setup.a.id, async (tx) => ({
      chunks: await tx
        .select()
        .from(knowledgeChunks)
        .where(eq(knowledgeChunks.documentId, documentId)),
      base: (await tx.select().from(knowledgeBases).where(eq(knowledgeBases.id, base.id)))[0],
    }))
    expect(rows.base).toMatchObject({
      embeddingModelKey: target,
      pendingEmbeddingModelKey: null,
      chunkCount: 2,
    })
    expect(rows.chunks.map((c) => c.embeddingModel)).toEqual([target, target])
    // searching after the swap works on the new model
    const result = await knowledge.retrieval.retrieve({
      orgId: setup.a.id,
      who: { userId: setup.a.members.adam.id, role: 'admin', teamIds: [] },
      question: 'annual leave days',
      answeringModelIsLocal: false,
      call: callContextOf(
        { orgId: setup.a.id, userId: setup.a.members.adam.id, teamIds: [], role: null },
        'swap',
      ),
    })
    expect(result.passages.length).toBeGreaterThan(0)
  })

  it('cancels a model change before the swap and drops the target passages', async () => {
    const { setup, files, base, modelKey } = await setupKnowledge()
    const { documentId } = await addFile(setup, files, base.id)
    if (documentId === undefined) throw new Error('no document was queued')
    await setup.container.modules.knowledge.ingestion.ingestDocument(setup.a.id, documentId, {
      resume: false,
    })
    const target = 'openai/text-embedding-3-small-c'
    await addEmbeddingModel(setup, modelKey, target, 'Embedding C')
    const url = basesUrl(setup.a.id, `/${base.id}/embedding-model`)
    await call(setup, 'adam', 'PUT', url, { modelKey: target })
    expect((await call(setup, 'adam', 'DELETE', url)).statusCode).toBe(204)
    const [row] = await setup.db.tenant(setup.a.id, (tx) =>
      tx.select().from(knowledgeBases).where(eq(knowledgeBases.id, base.id)),
    )
    expect(row).toMatchObject({ embeddingModelKey: modelKey, pendingEmbeddingModelKey: null })
  })
})
