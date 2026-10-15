// SPDX-License-Identifier: AGPL-3.0-only
import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { QUEUES } from '@/constants/queues.js'
import {
  auditLogs,
  connections,
  knowledgeDocuments,
  knowledgeSources,
  outboxEvents,
} from '@/database/tables/index.js'
import {
  connectionDtoSchema,
  connectionImpactDtoSchema,
  ERROR_CODES,
  knowledgeBaseDtoSchema,
  knowledgeConnectorItemsDtoSchema,
  knowledgeDocumentDtoSchema,
  knowledgeSourceDtoSchema,
  oauthCompleteDtoSchema,
  oauthStartDtoSchema,
} from '@surefy/contracts'

import { expectData, expectError, expectPage, request } from '../../../../test/helpers/request.js'
import {
  GOOGLE_ENV,
  setupConnections,
  stubGoogle,
  type ConnectionsSetup,
} from '../../connections/__tests__/connectionsTestKit.js'
import { KNOWLEDGE_JOBS } from '../knowledge.constants.js'
import { sourceKeyOf } from '../knowledge.keys.js'
import {
  basesUrl,
  createBase,
  createFakeFiles,
  createFakeMl,
  LEAVE_DOCUMENT,
  seedEmbeddingModel,
} from './knowledgeTestKit.js'

import type { FakeHttp } from '../../../../test/fixtures/fakeHttp.js'
import type { SafeGet } from '../knowledgeIngestion/safeFetch.js'
import type { OutboxTopic } from '@/modules/outbox/index.js'

const FOLDER = 'application/vnd.google-apps.folder'
const PDF = 'application/pdf'
const DOC = 'application/vnd.google-apps.document'

interface DriveFile {
  id: string
  name: string
  mimeType: string
  md5Checksum?: string
  version?: string
}

/** A Google Drive that can change between syncs, and refuse the sign-in when `expired`. */
function createDrive() {
  const drive = {
    expired: false,
    children: {
      root: [{ id: 'f-hr', name: 'HR', mimeType: FOLDER }],
      'f-hr': [
        { id: 'p-leave', name: 'Leave.pdf', mimeType: PDF, md5Checksum: 'leave-1' },
        { id: 'd-hand', name: 'Handbook', mimeType: DOC, version: '3' },
        { id: 'z-arch', name: 'Archive.zip', mimeType: 'application/zip', md5Checksum: 'z' },
        { id: 'f-pay', name: 'Payroll', mimeType: FOLDER },
      ],
      'f-pay': [{ id: 'p-pay', name: 'Pay.pdf', mimeType: PDF, md5Checksum: 'pay-1' }],
    } as Record<string, DriveFile[]>,
    downloads: [] as string[],
  }
  const install = (http: FakeHttp): void => {
    http.on('googleapis.com/drive/v3/drives', { body: { drives: [] } })
    http.on('googleapis.com/drive/v3/files', (call) => {
      if (drive.expired) return { status: 401, body: { error: { code: 401 } } }
      const q = new URL(call.url).searchParams.get('q') ?? ''
      const parent = /^'([^']+)' in parents/.exec(q)?.[1] ?? ''
      const foldersOnly = q.includes(`mimeType = '${FOLDER}'`)
      const files = (drive.children[parent] ?? []).filter(
        (file) => !foldersOnly || file.mimeType === FOLDER,
      )
      return { body: { files } }
    })
  }
  const get: SafeGet = (url, options) => {
    drive.downloads.push(url)
    const id = /\/files\/([^/?]+)/.exec(url)?.[1] ?? ''
    const authorized = options?.headers?.authorization?.startsWith('Bearer ') === true
    return Promise.resolve({
      status: drive.expired || !authorized ? 401 : 200,
      headers: { 'content-type': PDF },
      body: Buffer.from(`content of ${id}`),
      url,
    })
  }
  return Object.assign(drive, { install, get })
}

async function setupDrive() {
  const drive = createDrive()
  const files = createFakeFiles()
  const setup = await setupConnections({
    env: GOOGLE_ENV,
    ml: createFakeMl(LEAVE_DOCUMENT),
    knowledge: { files, get: drive.get },
  })
  stubGoogle(setup.http)
  drive.install(setup.http)
  await seedEmbeddingModel(setup)
  const base = await createBase(setup, 'adam')
  const connection = await signIn(setup)
  return { setup, drive, files, base, connectionId: connection.id }
}

/** Adam connects Maya's Google Drive for the organization (or signs it in again). */
async function signIn(setup: ConnectionsSetup, reconnectConnectionId?: string) {
  const started = expectData(
    await setup.call('adam', 'POST', '/oauth/start', {
      providerKey: 'google-drive',
      scope: 'organization',
      ...(reconnectConnectionId === undefined ? {} : { reconnectConnectionId }),
    }),
    200,
    oauthStartDtoSchema,
  )
  return expectData(
    await setup.call('adam', 'POST', '/oauth/complete', {
      state: started.state,
      code: 'code-maya',
    }),
    200,
    oauthCompleteDtoSchema,
  ).connection
}

const sourcesUrl = (setup: ConnectionsSetup, baseId: string, path = '') =>
  basesUrl(setup.a.id, `/${baseId}/sources${path}`)

const addFolders = async (
  setup: ConnectionsSetup,
  baseId: string,
  connectionId: string,
  folders = [{ externalId: 'f-hr', name: 'HR' }],
) =>
  expectData(
    await setup.callAt('adam', 'POST', sourcesUrl(setup, baseId, '/connectors'), {
      connectionId,
      folders,
    }),
    201,
    knowledgeSourceDtoSchema,
  )

const sourceOf = async (setup: ConnectionsSetup, baseId: string, sourceId: string) =>
  expectData(
    await setup.callAt('adam', 'GET', sourcesUrl(setup, baseId, `/${sourceId}`)),
    200,
    knowledgeSourceDtoSchema,
  )

const documentsOf = async (setup: ConnectionsSetup, baseId: string, sourceId: string) =>
  expectPage(
    await setup.callAt('adam', 'GET', sourcesUrl(setup, baseId, `/${sourceId}/documents`)),
    knowledgeDocumentDtoSchema,
  ).data.toSorted((a, b) => a.title.localeCompare(b.title))

const jobsNamed = async (setup: ConnectionsSetup, name: string) =>
  (await setup.container.queues.get(QUEUES.KNOWLEDGE_INGESTION).getJobs(['waiting', 'delayed']))
    .filter((job) => job.name === name)
    .map((job) => job.data as Record<string, string>)

/** The documents' processing is done: everything `ready`, as the ingestion job would leave it. */
const markReady = (setup: ConnectionsSetup, sourceId: string) =>
  setup.db.tenant(setup.a.id, (tx) =>
    tx
      .update(knowledgeDocuments)
      .set({ status: 'ready' })
      .where(eq(knowledgeDocuments.sourceId, sourceId)),
  )

/** Delivers the outbox events of a topic to the knowledge module's handlers, as the worker would. */
async function deliver(setup: ConnectionsSetup, topic: OutboxTopic) {
  const events = await setup.db.system('test', (tx) =>
    tx
      .select()
      .from(outboxEvents)
      .where(and(eq(outboxEvents.organizationId, setup.a.id), eq(outboxEvents.topic, topic))),
  )
  const handlers = setup.container.modules.knowledge.outboxHandlers.filter(
    (handler) => handler.topic === topic,
  )
  expect(handlers).toHaveLength(1)
  for (const event of events) {
    for (const handler of handlers) {
      await handler.handle({
        eventId: event.id,
        orgId: event.organizationId,
        topic,
        payload: event.payload as never,
      })
    }
  }
  return events.length
}

describe('connector sources', () => {
  it('browses the folders a connection sees and marks the ones already in the base', async () => {
    const { setup, base, connectionId } = await setupDrive()
    const items = (query: Record<string, string>) =>
      setup.callAt(
        'adam',
        'GET',
        `${sourcesUrl(setup, base.id, '/connector-items')}?${new URLSearchParams({ connectionId, ...query }).toString()}`,
      )

    const top = expectData(await items({}), 200, knowledgeConnectorItemsDtoSchema)
    expect(top.provider).toBe('google_drive')
    expect(top.items.map((item) => item.name)).toEqual(['My Drive'])
    let hr = expectData(await items({ parentId: 'root' }), 200, knowledgeConnectorItemsDtoSchema)
    expect(hr.items).toEqual([
      {
        externalId: 'f-hr',
        name: 'HR',
        kind: 'folder',
        hasChildren: true,
        path: null,
        inBase: false,
      },
    ])

    await addFolders(setup, base.id, connectionId)
    hr = expectData(await items({ parentId: 'root' }), 200, knowledgeConnectorItemsDtoSchema)
    expect(hr.items[0]?.inBase).toBe(true)

    // a connection that is not a Drive or Notion one the person may use
    expectError(
      await setup.callAt(
        'adam',
        'GET',
        `${sourcesUrl(setup, base.id, '/connector-items')}?connectionId=${crypto.randomUUID()}`,
      ),
      422,
      ERROR_CODES.KNOWLEDGE_CONNECTION_INVALID,
    )
    expectError(
      await setup.callAt('adam', 'POST', sourcesUrl(setup, base.id, '/connectors'), {
        connectionId: crypto.randomUUID(),
        folders: [{ externalId: 'f-hr', name: 'HR' }],
      }),
      422,
      ERROR_CODES.KNOWLEDGE_CONNECTION_INVALID,
    )
  })

  it('syncs the folders, re-syncs only what changed, and deletes what is gone', async () => {
    const { setup, drive, files, base, connectionId } = await setupDrive()
    const knowledge = setup.container.modules.knowledge
    const created = await addFolders(setup, base.id, connectionId, [
      { externalId: 'f-hr', name: 'HR' },
      { externalId: 'f-pay', name: 'Payroll' },
    ])
    expect(created).toMatchObject({
      type: 'connector',
      status: 'queued',
      name: 'HR + 1 more',
      connectionId,
      connector: { provider: 'google_drive', syncEvery: 'daily' },
    })
    expect(await jobsNamed(setup, KNOWLEDGE_JOBS.SYNC_SOURCE)).toEqual([
      { orgId: setup.a.id, sourceId: created.id },
    ])

    await knowledge.sync.syncSource(setup.a.id, created.id)
    let documents = await documentsOf(setup, base.id, created.id)
    // the zip is not something Knowledge reads; Payroll is reached once although chosen twice
    expect(documents.map((doc) => [doc.title, doc.status])).toEqual([
      ['Handbook', 'pending'],
      ['Leave.pdf', 'pending'],
      ['Pay.pdf', 'pending'],
    ])
    expect(await jobsNamed(setup, KNOWLEDGE_JOBS.INGEST_DOCUMENT)).toHaveLength(3)
    expect(drive.downloads.some((url) => url.includes('/files/d-hand/export?mimeType='))).toBe(true)
    const leave = documents.find((doc) => doc.title === 'Leave.pdf')
    expect(files.objects.get(sourceKeyOf(setup.a.id, leave?.id ?? ''))).toEqual(
      Buffer.from('content of p-leave'),
    )
    const synced = await sourceOf(setup, base.id, created.id)
    expect(synced.status).toBe('processing')
    const nextIn = new Date(synced.nextSyncAt ?? 0).getTime() - Date.now()
    expect(nextIn).toBeGreaterThan(23 * 3_600_000)

    // the documents were indexed; then Leave.pdf changes and Pay.pdf goes away
    await markReady(setup, created.id)
    drive.downloads.length = 0
    const leaveDoc = drive.children['f-hr']?.find((file) => file.id === 'p-leave')
    if (leaveDoc !== undefined) leaveDoc.md5Checksum = 'leave-2'
    drive.children['f-pay'] = []
    await knowledge.sync.syncSource(setup.a.id, created.id)

    documents = await documentsOf(setup, base.id, created.id)
    expect(documents.map((doc) => [doc.title, doc.status])).toEqual([
      ['Handbook', 'ready'],
      ['Leave.pdf', 'pending'],
    ])
    // only the changed file was downloaded again
    expect(drive.downloads).toHaveLength(1)
    expect(drive.downloads[0]).toContain('/files/p-leave?alt=media')
    expect(files.deleted.some((key) => key.endsWith('/source'))).toBe(true)
  })

  it('changes the folders and the schedule, and syncs the new folders at once', async () => {
    const { setup, base, connectionId } = await setupDrive()
    const created = await addFolders(setup, base.id, connectionId)
    await setup.container.modules.knowledge.sync.syncSource(setup.a.id, created.id)
    await markReady(setup, created.id)
    await setup.container.modules.knowledge.sync.syncSource(setup.a.id, created.id)

    const changed = expectData(
      await setup.callAt('adam', 'PATCH', sourcesUrl(setup, base.id, `/${created.id}`), {
        connector: { folders: [{ externalId: 'f-pay', name: 'Payroll' }], syncEvery: 'hourly' },
      }),
      200,
      knowledgeSourceDtoSchema,
    )
    expect(changed).toMatchObject({
      status: 'queued',
      connector: { folders: [{ externalId: 'f-pay', name: 'Payroll' }], syncEvery: 'hourly' },
    })
    const nextIn = new Date(changed.nextSyncAt ?? 0).getTime() - Date.now()
    expect(nextIn).toBeLessThanOrEqual(3_600_000)
    const [entry] = await setup.db.system('test', (tx) =>
      tx
        .select()
        .from(auditLogs)
        .where(
          and(eq(auditLogs.action, 'knowledge_source.updated'), eq(auditLogs.targetId, created.id)),
        ),
    )
    expect(entry?.metadata).toMatchObject({
      changes: [
        { field: 'folders', to: [{ externalId: 'f-pay', name: 'Payroll' }] },
        { field: 'syncEvery', from: 'daily', to: 'hourly' },
      ],
    })

    await setup.container.modules.knowledge.sync.syncSource(setup.a.id, created.id)
    expect((await documentsOf(setup, base.id, created.id)).map((doc) => doc.title)).toEqual([
      'Pay.pdf',
    ])

    // a link has no folders
    expectError(
      await setup.callAt('adam', 'PATCH', sourcesUrl(setup, base.id, `/${created.id}`), {
        link: { crawlDepth: 2 },
      }),
      409,
      ERROR_CODES.KNOWLEDGE_SOURCE_STATE_INVALID,
    )
  })

  it('pauses on an expired sign-in, keeps the passages, and resumes after Reconnect', async () => {
    const { setup, drive, base, connectionId } = await setupDrive()
    const knowledge = setup.container.modules.knowledge
    const created = await addFolders(setup, base.id, connectionId)
    await knowledge.sync.syncSource(setup.a.id, created.id)
    await markReady(setup, created.id)

    // Google refuses the token: the source pauses and the connection is expired
    drive.expired = true
    await knowledge.sync.syncSource(setup.a.id, created.id)
    const paused = await sourceOf(setup, base.id, created.id)
    expect(paused).toMatchObject({
      status: 'paused',
      errorCode: ERROR_CODES.KNOWLEDGE_CONNECTION_EXPIRED,
      nextSyncAt: null,
    })
    expect(paused.documentCount).toBe(3)
    const [row] = await setup.db.tenant(setup.a.id, (tx) =>
      tx.select().from(connections).where(eq(connections.id, connectionId)),
    )
    expect(row?.status).toBe('expired')
    // browsing says Reconnect
    expectError(
      await setup.callAt(
        'adam',
        'GET',
        `${sourcesUrl(setup, base.id, '/connector-items')}?connectionId=${connectionId}`,
      ),
      409,
      ERROR_CODES.KNOWLEDGE_CONNECTION_EXPIRED,
    )
    // a sync job for a paused source does nothing
    drive.downloads.length = 0
    await knowledge.sync.syncSource(setup.a.id, created.id)
    expect(drive.downloads).toHaveLength(0)

    // Reconnect: the event queues the paused source and syncs it
    drive.expired = false
    await signIn(setup, connectionId)
    expect(await deliver(setup, 'connection.reconnected')).toBe(1)
    const queued = await sourceOf(setup, base.id, created.id)
    expect(queued).toMatchObject({ status: 'queued', errorCode: null })
    expect(
      (await jobsNamed(setup, KNOWLEDGE_JOBS.SYNC_SOURCE)).filter(
        (job) => job.sourceId === created.id,
      ).length,
    ).toBeGreaterThanOrEqual(2)
    await knowledge.sync.syncSource(setup.a.id, created.id)
    const resumed = await sourceOf(setup, base.id, created.id)
    expect(resumed.status).toBe('ready')
    expect(resumed.nextSyncAt).not.toBeNull()

    // an expiry noticed elsewhere (a refresh refused) pauses it through the event as well
    await setup.db.system('test', (tx) =>
      tx
        .delete(outboxEvents)
        .where(
          and(
            eq(outboxEvents.organizationId, setup.a.id),
            eq(outboxEvents.topic, 'connection.expired'),
          ),
        ),
    )
    drive.expired = true
    await knowledge.sync.syncSource(setup.a.id, created.id)
    await setup.db.tenant(setup.a.id, (tx) =>
      tx
        .update(knowledgeSources)
        .set({ status: 'ready', errorCode: null })
        .where(eq(knowledgeSources.id, created.id)),
    )
    expect(await deliver(setup, 'connection.expired')).toBe(1)
    expect((await sourceOf(setup, base.id, created.id)).status).toBe('paused')
  })

  it('lists its sources as the connection’s dependents and removes them on Disconnect', async () => {
    const { setup, base, connectionId } = await setupDrive()
    const created = await addFolders(setup, base.id, connectionId)

    const impact = expectData(
      await setup.call('adam', 'GET', `/${connectionId}/impact`),
      200,
      connectionImpactDtoSchema,
    )
    expect(impact).toEqual({
      dependents: [{ type: 'knowledge_source', count: 1 }],
      listed: [{ type: 'knowledge_source', id: created.id, name: 'HR' }],
    })

    expectData(
      await setup.call('adam', 'POST', `/${connectionId}/revoke`),
      200,
      connectionDtoSchema,
    )
    expect(await deliver(setup, 'connection.revoked')).toBe(1)
    const removed = await sourceOf(setup, base.id, created.id)
    expect(removed.deletedAt).not.toBeNull()
    expect(removed.nextSyncAt).toBeNull()
    // a second delivery changes nothing, and the source cannot come back without its connection
    expect(await deliver(setup, 'connection.revoked')).toBe(1)
    expectError(
      await setup.callAt('adam', 'POST', sourcesUrl(setup, base.id, `/${created.id}/restore`)),
      422,
      ERROR_CODES.KNOWLEDGE_CONNECTION_INVALID,
    )
  })

  it("refuses another organization's connection without calling the app", async () => {
    const { setup, connectionId } = await setupDrive()
    // a base of B that takes documents, so the connection is what is checked
    await seedEmbeddingModel(setup, 'b')
    const bea = setup.sessionOf(setup.b.members.bea)
    const own = expectData(
      await request(setup.app, 'POST', basesUrl(setup.b.id), {
        headers: bea,
        payload: { name: 'Library of B' },
      }),
      201,
      knowledgeBaseDtoSchema,
    )
    const ownSources = basesUrl(setup.b.id, `/${own.id}/sources`)
    const driveCalls = setup.http.callsTo('/drive/v3/').length

    // B's Owner, in B's own base, names A's Drive connection: it is not one B may use
    expectError(
      await request(
        setup.app,
        'GET',
        `${ownSources}/connector-items?connectionId=${connectionId}`,
        {
          headers: bea,
        },
      ),
      422,
      ERROR_CODES.KNOWLEDGE_CONNECTION_INVALID,
    )
    expectError(
      await request(setup.app, 'POST', `${ownSources}/connectors`, {
        headers: bea,
        payload: { connectionId, folders: [{ externalId: 'f-hr', name: 'HR' }] },
      }),
      422,
      ERROR_CODES.KNOWLEDGE_CONNECTION_INVALID,
    )
    expect(setup.http.callsTo('/drive/v3/')).toHaveLength(driveCalls)
    const sourcesOfB = await setup.db.tenant(setup.b.id, (tx) =>
      tx.select().from(knowledgeSources).where(eq(knowledgeSources.organizationId, setup.b.id)),
    )
    expect(sourcesOfB).toEqual([])
  })
})
