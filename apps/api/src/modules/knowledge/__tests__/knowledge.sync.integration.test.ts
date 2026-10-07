// SPDX-License-Identifier: AGPL-3.0-only
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { QUEUES } from '@/constants/queues.js'
import { knowledgeDocuments, knowledgeSources } from '@/database/tables/index.js'
import {
  ERROR_CODES,
  knowledgeDocumentDtoSchema,
  knowledgeSourceDtoSchema,
} from '@surefy/contracts'

import { setupTwoOrgs, type TwoOrgSetup } from '../../../../test/helpers/orgSetup.js'
import { expectData, expectError, expectPage, request } from '../../../../test/helpers/request.js'
import { KNOWLEDGE_JOBS } from '../knowledge.constants.js'
import {
  basesUrl,
  createBase,
  createFakeFiles,
  createFakeMl,
  LEAVE_DOCUMENT,
  seedEmbeddingModel,
} from './knowledgeTestKit.js'

import type { SafeGet, SafeResponse } from '../knowledgeIngestion/safeFetch.js'

/** A website that can change between syncs. */
function createWeb(pages: Record<string, string>) {
  const web = {
    pages,
    calls: [] as string[],
    get: ((url: string) => {
      web.calls.push(url)
      const html = web.pages[url]
      const response: SafeResponse =
        html === undefined
          ? { status: 404, headers: {}, body: Buffer.alloc(0), url }
          : { status: 200, headers: { 'content-type': 'text/html' }, body: Buffer.from(html), url }
      return Promise.resolve(response)
    }) satisfies SafeGet,
  }
  return web
}

const page = (title: string, body: string, links: string[] = []) =>
  '<html><title>' +
  title +
  '</title><body>' +
  body +
  links.map((l) => '<a href="' + l + '">l</a>').join('') +
  '</body></html>'

const link = (over: Record<string, unknown> = {}) => ({
  url: 'https://docs.example.test/',
  crawlDepth: 1,
  includePaths: [],
  excludePaths: [],
  refresh: 'daily',
  ...over,
})

async function setupLinks(pages: Record<string, string>) {
  const web = createWeb(pages)
  const files = createFakeFiles()
  const ml = createFakeMl(LEAVE_DOCUMENT)
  const setup = await setupTwoOrgs({ ml, knowledge: { files, get: web.get } })
  await seedEmbeddingModel(setup)
  const base = await createBase(setup, 'adam')
  return { setup, web, files, ml, base }
}

const adam = (
  setup: TwoOrgSetup,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  payload?: unknown,
) =>
  request(setup.app, method, url, {
    headers: setup.sessionOf(setup.a.members.adam),
    ...(payload === undefined ? {} : { payload }),
  })

const jobsNamed = async (setup: TwoOrgSetup, name: string) =>
  (await setup.container.queues.get(QUEUES.KNOWLEDGE_INGESTION).getJobs(['waiting', 'delayed']))
    .filter((job) => job.name === name)
    .map((job) => job.data as Record<string, string>)

const SITE = {
  'https://docs.example.test/': page('Docs home', 'Welcome', ['/leave', '/pay']),
  'https://docs.example.test/leave': page('Leave', 'Twenty-five days'),
  'https://docs.example.test/pay': page('Pay', 'Paid monthly'),
}

describe('link sources', () => {
  it('rejects addresses that are not web pages', async () => {
    const { setup, base } = await setupLinks(SITE)
    expectError(
      await adam(
        setup,
        'POST',
        basesUrl(setup.a.id, `/${base.id}/sources/links`),
        link({ url: 'ftp://files.example.test/a' }),
      ),
      422,
      ERROR_CODES.VALIDATION_FAILED,
    )
  })

  it('crawls the site, ingests every page, and re-syncs only what changed', async () => {
    const { setup, web, ml, base } = await setupLinks(SITE)
    const knowledge = setup.container.modules.knowledge
    const created = expectData(
      await adam(setup, 'POST', basesUrl(setup.a.id, `/${base.id}/sources/links`), link()),
      201,
      knowledgeSourceDtoSchema,
    )
    expect(created).toMatchObject({ type: 'link', status: 'queued', name: 'docs.example.test' })
    expect(created.link).toMatchObject({ url: 'https://docs.example.test/', crawlDepth: 1 })
    expect(await jobsNamed(setup, KNOWLEDGE_JOBS.SYNC_SOURCE)).toEqual([
      { orgId: setup.a.id, sourceId: created.id },
    ])

    await knowledge.sync.syncSource(setup.a.id, created.id)

    const documents = expectPage(
      await adam(setup, 'GET', basesUrl(setup.a.id, `/${base.id}/sources/${created.id}/documents`)),
      knowledgeDocumentDtoSchema,
    ).data
    expect(documents.map((d) => d.title).sort((a, b) => a.localeCompare(b))).toEqual([
      'Docs home',
      'Leave',
      'Pay',
    ])
    expect(documents.every((d) => d.status === 'pending')).toBe(true)
    const ingestJobs = await jobsNamed(setup, KNOWLEDGE_JOBS.INGEST_DOCUMENT)
    expect(ingestJobs).toHaveLength(3)
    let source = expectData(
      await adam(setup, 'GET', basesUrl(setup.a.id, `/${base.id}/sources/${created.id}`)),
      200,
      knowledgeSourceDtoSchema,
    )
    // named by the first page's title, scheduled for tomorrow, still processing
    expect(source).toMatchObject({ name: 'Docs home', status: 'processing', documentCount: 3 })
    expect(source.nextSyncAt).not.toBeNull()
    expect(source.lastSyncedAt).not.toBeNull()

    for (const job of ingestJobs) {
      await knowledge.ingestion.ingestDocument(setup.a.id, job.documentId ?? '', { resume: false })
    }
    source = expectData(
      await adam(setup, 'GET', basesUrl(setup.a.id, `/${base.id}/sources/${created.id}`)),
      200,
      knowledgeSourceDtoSchema,
    )
    expect(source).toMatchObject({ status: 'ready', progressPercent: 100 })
    expect(ml.calls.every((c) => c.mimeType === 'text/html')).toBe(true)

    // one page changes, one disappears (the home page, still linking to it, is unchanged)
    web.pages['https://docs.example.test/leave'] = page('Leave', 'Thirty days now')
    delete web.pages['https://docs.example.test/pay']
    await setup.container.queues.get(QUEUES.KNOWLEDGE_INGESTION).drain()
    await knowledge.sync.syncSource(setup.a.id, created.id)
    const after = expectPage(
      await adam(setup, 'GET', basesUrl(setup.a.id, `/${base.id}/sources/${created.id}/documents`)),
      knowledgeDocumentDtoSchema,
    ).data
    // the unchanged home page keeps its passages (and the title the parser gave it)
    expect(after.map((d) => `${d.title}:${d.status}`).sort((a, b) => a.localeCompare(b))).toEqual([
      'Leave policy:ready',
      'Leave:pending',
    ])
    expect(await jobsNamed(setup, KNOWLEDGE_JOBS.INGEST_DOCUMENT)).toHaveLength(1)
  })

  it('fails a source whose address cannot be reached, and says why', async () => {
    const { setup, base } = await setupLinks({})
    const created = expectData(
      await adam(setup, 'POST', basesUrl(setup.a.id, `/${base.id}/sources/links`), link()),
      201,
      knowledgeSourceDtoSchema,
    )
    await setup.container.modules.knowledge.sync.syncSource(setup.a.id, created.id)
    const source = expectData(
      await adam(setup, 'GET', basesUrl(setup.a.id, `/${base.id}/sources/${created.id}`)),
      200,
      knowledgeSourceDtoSchema,
    )
    expect(source).toMatchObject({
      status: 'failed',
      errorCode: ERROR_CODES.KNOWLEDGE_LINK_UNREACHABLE,
    })
    expect(source.nextSyncAt).not.toBeNull()
    // Sync now goes again; a file source has nothing to sync
    const again = expectData(
      await adam(setup, 'POST', basesUrl(setup.a.id, `/${base.id}/sources/${created.id}/sync`)),
      200,
      knowledgeSourceDtoSchema,
    )
    expect(again.status).toBe('queued')
    expectError(
      await adam(setup, 'POST', basesUrl(setup.a.id, `/${base.id}/sources/${created.id}/sync`)),
      409,
      ERROR_CODES.KNOWLEDGE_SOURCE_STATE_INVALID,
    )
  })

  it('enqueues a sync for every due source and skips deleted ones', async () => {
    const { setup, base } = await setupLinks(SITE)
    const url = basesUrl(setup.a.id, `/${base.id}/sources/links`)
    const due = expectData(await adam(setup, 'POST', url, link()), 201, knowledgeSourceDtoSchema)
    const removed = expectData(
      await adam(setup, 'POST', url, link({ url: 'https://other.example.test/' })),
      201,
      knowledgeSourceDtoSchema,
    )
    const notDue = expectData(
      await adam(setup, 'POST', url, link({ url: 'https://third.example.test/' })),
      201,
      knowledgeSourceDtoSchema,
    )
    await setup.container.queues.get(QUEUES.KNOWLEDGE_INGESTION).drain()
    expect(
      (await adam(setup, 'DELETE', basesUrl(setup.a.id, `/${base.id}/sources/${removed.id}`)))
        .statusCode,
    ).toBe(204)
    await setup.db.tenant(setup.a.id, async (tx) => {
      const past = new Date(Date.now() - 60_000)
      for (const id of [due.id, removed.id]) {
        await tx
          .update(knowledgeSources)
          .set({ nextSyncAt: past })
          .where(eq(knowledgeSources.id, id))
      }
      await tx
        .update(knowledgeSources)
        .set({ nextSyncAt: new Date(Date.now() + 3_600_000) })
        .where(eq(knowledgeSources.id, notDue.id))
    })
    const count = await setup.container.modules.knowledge.sync.scheduleDueSyncs()
    expect(count).toBe(1)
    expect(await jobsNamed(setup, KNOWLEDGE_JOBS.SYNC_SOURCE)).toEqual([
      { orgId: setup.a.id, sourceId: due.id },
    ])
  })

  it('removes the pages of a source with its passages when the source is purged by id', async () => {
    const { setup, base } = await setupLinks(SITE)
    const created = expectData(
      await adam(setup, 'POST', basesUrl(setup.a.id, `/${base.id}/sources/links`), link()),
      201,
      knowledgeSourceDtoSchema,
    )
    await setup.container.modules.knowledge.sync.syncSource(setup.a.id, created.id)
    // the database cascades documents with their source
    await setup.db.tenant(setup.a.id, (tx) =>
      tx.delete(knowledgeSources).where(eq(knowledgeSources.id, created.id)),
    )
    const left = await setup.db.tenant(setup.a.id, (tx) =>
      tx.select().from(knowledgeDocuments).where(eq(knowledgeDocuments.sourceId, created.id)),
    )
    expect(left).toEqual([])
  })
})
