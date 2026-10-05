// SPDX-License-Identifier: AGPL-3.0-only
import { eq } from 'drizzle-orm'

import { QUEUES } from '@/constants/queues.js'
import {
  auditLogs,
  chatAttachments,
  chatFolders,
  chatKnowledgeBases,
  chatMessageCitations,
  chatMessageFeedback,
  chatMessages,
  chats,
  knowledgeChunks,
  knowledgeDocuments,
  knowledgeSources,
  organizationPurges,
  organizationSlugHistory,
  outboxEvents,
} from '@/database/tables/index.js'
import { notificationFactory } from '@/modules/notifications/__tests__/notificationsTestKit.js'
import {
  credentialDtoSchema,
  dataRequestDtoSchema,
  exportDtoSchema,
  invitationDtoSchema,
  knowledgeBaseDtoSchema,
  teamDtoSchema,
  vaultModelDtoSchema,
} from '@surefy/contracts'

import { expectData, expectPage, request } from '../helpers/request.js'

import type { TwoOrgSetup } from '../helpers/orgSetup.js'
import type { SendEmailPayload } from '@/modules/notifications/index.js'

/**
 * One chat of Uma's in A, with a folder, an answer with a citation and a rating, and an
 * attachment: every chat table holds a row of A. Written straight to the tables, so the suite
 * does not need a model.
 */
async function seedChat(setup: TwoOrgSetup, orgId: string, userId: string) {
  return setup.db.tenant(orgId, async (tx) => {
    const [folder] = await tx
      .insert(chatFolders)
      .values({ organizationId: orgId, ownerUserId: userId, name: 'Secret Folder' })
      .returning({ id: chatFolders.id })
    const [chat] = await tx
      .insert(chats)
      .values({
        organizationId: orgId,
        ownerUserId: userId,
        title: CHAT_TITLE,
        folderId: folder?.id ?? null,
        messageCount: 2,
        lastMessageAt: new Date(),
      })
      .returning({ id: chats.id })
    if (folder === undefined || chat === undefined) throw new Error('chat seed failed')
    await tx.insert(chatKnowledgeBases).values({
      organizationId: orgId,
      chatId: chat.id,
      knowledgeBaseId: '0198a000-0000-7000-8000-00000000c0de',
    })
    await tx.insert(chatMessages).values({
      organizationId: orgId,
      chatId: chat.id,
      role: 'user',
      status: 'complete',
      contentText: CHAT_TEXT,
      parts: { version: 1, parts: [{ type: 'text', text: CHAT_TEXT }] },
      authorUserId: userId,
    })
    const [answer] = await tx
      .insert(chatMessages)
      .values({
        organizationId: orgId,
        chatId: chat.id,
        role: 'assistant',
        status: 'complete',
        contentText: 'secret answer [1]',
        parts: {
          version: 1,
          parts: [
            { type: 'text', text: 'secret answer [1]' },
            {
              type: 'source',
              index: 1,
              kind: 'web',
              url: 'https://secret.example.test',
              title: 'Secret source',
              snippet: 'snippet',
            },
          ],
        },
        modelKey: 'openai/gpt-test',
      })
      .returning({ id: chatMessages.id })
    if (answer === undefined) throw new Error('chat seed failed')
    await tx
      .insert(chatMessageCitations)
      .values({ organizationId: orgId, messageId: answer.id, rank: 1 })
    await tx.insert(chatMessageFeedback).values({
      organizationId: orgId,
      messageId: answer.id,
      userId,
      rating: 'helpful',
      isTrainEligible: true,
    })
    const [attachment] = await tx
      .insert(chatAttachments)
      .values({
        organizationId: orgId,
        chatId: chat.id,
        objectKey: `orgs/${orgId}/chats/${chat.id}/attachments/seed`,
        fileName: 'secret-plan.pdf',
        contentType: 'application/pdf',
        sizeBytes: 10,
        kind: 'document',
        status: 'ready',
      })
      .returning({ id: chatAttachments.id })
    if (attachment === undefined) throw new Error('chat seed failed')
    return {
      chatId: chat.id,
      messageId: answer.id,
      folderId: folder.id,
      attachmentId: attachment.id,
    }
  })
}

/** Organization A with one real resource of every kind a route can name, and B's Owner. */
export interface IsolationFixture {
  orgA: { id: string }
  orgB: { id: string; ownerId: string }
  /** A's real ids by path parameter name; a route with a parameter missing here fails loudly. */
  params: Readonly<Record<string, string>>
  /** A's ids and content that must never reach B (testing.md, §4, step 3). */
  markers: readonly string[]
}

const INVITEE = 'secret.invitee@example.test'
const VAULT_SECRET = 'sk-isolation-secret-of-acme-0042'
const CHAT_TITLE = 'Secret Chat of Uma'
const CHAT_TEXT = 'secret question about the merger'
const KNOWLEDGE_FILE = 'secret-leave-policy.pdf'
const KNOWLEDGE_PASSAGE = 'The secret leave policy grants nineteen days'

const tokenFromQueue = async (setup: TwoOrgSetup): Promise<string> => {
  const jobs = await setup.container.queues.get(QUEUES.EMAIL).getJobs(['waiting', 'delayed'])
  const sent = jobs
    .map((job) => job.data as SendEmailPayload)
    .find((payload) => payload.template === 'invitation' && payload.to === INVITEE)
  const token = sent?.template === 'invitation' ? sent.url.split('/invite/')[1] : undefined
  if (token === undefined || token === '') throw new Error('no invitation email queued')
  return token
}

/**
 * Seeds A through its own Owner, the way the product does: a team with Uma, a pending invitation
 * (and its link token), a notification for Uma, Olivia's member preferences and a retired slug.
 * Every tenant table then holds rows of A, which the database-layer check relies on.
 */
export async function seedIsolationFixture(setup: TwoOrgSetup): Promise<IsolationFixture> {
  const { app, a, b } = setup
  const { olivia, adam, uma } = a.members
  const headers = setup.sessionOf(olivia)
  const orgUrl = `/api/v1/orgs/${a.id}`

  const team = expectData(
    await request(app, 'POST', `${orgUrl}/teams`, {
      headers,
      payload: { name: 'Secret Lab', memberUserIds: [uma.id] },
    }),
    201,
    teamDtoSchema,
  )
  const invitation = expectData(
    await request(app, 'POST', `${orgUrl}/invitations`, {
      headers,
      payload: { email: INVITEE, role: 'user', teamIds: [team.id] },
    }),
    201,
    invitationDtoSchema,
  )
  const token = await tokenFromQueue(setup)
  const preferences = await request(app, 'PATCH', `${orgUrl}/members/me/preferences`, {
    headers,
    payload: { tableDensity: 'compact' },
  })
  if (preferences.statusCode !== 200) throw new Error(`preferences: ${preferences.body}`)
  const sessions = await request(app, 'GET', '/api/v1/me/sessions', { headers })
  const sessionId = sessions.json<{ data: { id: string }[] }>().data[0]?.id
  if (sessionId === undefined) throw new Error(`no session of Olivia: ${sessions.body}`)

  const notification = await setup.db.system('test', async (tx) => {
    await tx.insert(organizationSlugHistory).values({
      organizationId: a.id,
      slug: 'acme-research-old',
      redirectUntil: new Date(Date.now() + 86_400_000),
    })
    return notificationFactory.create(tx, { organizationId: a.id, userId: uma.id })
  })

  // Vault rows of A: a key (its data key and the provider's models with their access rules) and
  // a local server with its models; the settings row exists from the organization's creation.
  const vaultUrl = `${orgUrl}/vault`
  const credential = expectData(
    await request(app, 'POST', `${vaultUrl}/credentials`, {
      headers,
      payload: {
        scope: 'organization',
        name: 'Secret OpenAI',
        providerKey: 'openai',
        secret: VAULT_SECRET,
      },
    }),
    201,
    credentialDtoSchema,
  )
  const server = expectData(
    await request(app, 'POST', `${vaultUrl}/local-servers`, {
      headers,
      payload: {
        scope: 'organization',
        name: 'Secret Ollama',
        providerKey: 'ollama',
        baseUrl: 'http://ollama.secret-lab.test:11434',
      },
    }),
    201,
    credentialDtoSchema,
  )
  const [model] = expectPage(
    await request(app, 'GET', `${vaultUrl}/models`, { headers, query: { providerKey: 'openai' } }),
    vaultModelDtoSchema,
  ).data
  if (model === undefined) throw new Error('no vault model of A')

  // Access, audit and data control rows of A: a policy (and its audit entry), a full export
  // request, a background export, a sealed chain head and a purge record.
  const policy = await request(app, 'PUT', `${orgUrl}/access/policy`, {
    headers,
    payload: { version: 1, tools: { mcp: false } },
  })
  if (policy.statusCode !== 200) throw new Error(`access policy: ${policy.body}`)
  const dataRequest = expectData(
    await request(app, 'POST', `${orgUrl}/data-requests`, { headers, payload: { type: 'export' } }),
    201,
    dataRequestDtoSchema,
  )
  const dataExport = expectData(
    await request(app, 'POST', `${orgUrl}/exports`, {
      headers,
      payload: { kind: 'members_csv', params: { version: 1, format: 'csv' } },
    }),
    202,
    exportDtoSchema,
  )
  await setup.container.modules.audit.service.sealPending()
  // Usage of A: one metered call, rolled up into the daily and monthly totals
  const { usage } = setup.container.modules
  await setup.db.tenant(a.id, (tx) =>
    usage.meter.recordInTx(tx, a.id, {
      userId: uma.id,
      teamId: team.id,
      apiKeyId: null,
      sourceModule: 'chat',
      subjectType: null,
      subjectId: null,
      sourceRefId: null,
      kind: 'generation',
      modelKey: model.modelKey,
      vaultModelId: model.id,
      credentialId: null,
      credentialScope: 'organization',
      providerKey: 'openai',
      inputTokens: 10,
      outputTokens: 5,
      cachedInputTokens: 0,
      reasoningTokens: 0,
      units: 0,
      costMicros: 7,
      currency: 'USD',
      billedVia: 'provider_direct',
      latencyMs: 100,
      outcome: 'success',
      errorCode: null,
      routed: false,
      fallbackFromModelKey: null,
      piiMasked: false,
      dataLocation: 'provider',
      dedupeKey: 'chat:isolation:0',
      requestId: null,
      occurredAt: new Date().toISOString(),
    }),
  )
  await usage.rollup.aggregate('hourly')
  const chat = await seedChat(setup, a.id, uma.id)
  const entryId = await setup.db.system('test', async (tx) => {
    await tx.insert(organizationPurges).values({
      organizationId: a.id,
      reason: 'owner_request',
      status: 'canceled',
      scheduledFor: new Date(),
    })
    await tx.insert(outboxEvents).values({
      organizationId: a.id,
      topic: 'chat.purged',
      payload: { version: 1, id: chat.chatId },
      status: 'dispatched',
    })
    const [entry] = await tx
      .select({ id: auditLogs.id })
      .from(auditLogs)
      .where(eq(auditLogs.organizationId, a.id))
      .limit(1)
    if (entry === undefined) throw new Error('no audit entry of A')
    return entry.id
  })

  // Knowledge of A: a base shared with the team (through the API), then a file source with its
  // document and one passage written as fixtures, since uploads need storage to sign them.
  const knowledgeBase = expectData(
    await request(app, 'POST', `${orgUrl}/knowledge-bases`, {
      headers,
      payload: { name: 'Secret Handbook', teamIds: [team.id] },
    }),
    201,
    knowledgeBaseDtoSchema,
  )
  const knowledge = await setup.db.tenant(a.id, async (tx) => {
    const [source] = await tx
      .insert(knowledgeSources)
      .values({
        organizationId: a.id,
        knowledgeBaseId: knowledgeBase.id,
        type: 'file',
        name: KNOWLEDGE_FILE,
        fileName: KNOWLEDGE_FILE,
        contentType: 'application/pdf',
        sizeBytes: 1024,
        sha256: Buffer.alloc(32, 7),
        status: 'ready',
        progressPercent: 100,
        addedByUserId: olivia.id,
      })
      .returning()
    if (source === undefined) throw new Error('no knowledge source of A')
    const [document] = await tx
      .insert(knowledgeDocuments)
      .values({
        organizationId: a.id,
        knowledgeBaseId: knowledgeBase.id,
        sourceId: source.id,
        externalRef: 'file',
        title: KNOWLEDGE_FILE,
        mimeType: 'application/pdf',
        status: 'ready',
        chunkCount: 1,
      })
      .returning()
    if (document === undefined) throw new Error('no knowledge document of A')
    await tx.insert(knowledgeChunks).values({
      organizationId: a.id,
      knowledgeBaseId: knowledgeBase.id,
      sourceId: source.id,
      documentId: document.id,
      ordinal: 0,
      content: KNOWLEDGE_PASSAGE,
      tokenCount: 9,
      embedding: Array.from({ length: 384 }, () => 0.01),
      embeddingModel: 'isolation/embedding',
    })
    return { sourceId: source.id, documentId: document.id }
  })

  return {
    orgA: { id: a.id },
    orgB: { id: b.id, ownerId: b.members.bea.id },
    params: {
      memberId: uma.memberId,
      userId: uma.id,
      teamId: team.id,
      invitationId: invitation.id,
      notificationId: notification.id,
      sessionId,
      token,
      entryId,
      dataRequestId: dataRequest.id,
      exportId: dataExport.id,
      credentialId: credential.id,
      serverId: server.id,
      modelId: model.id,
      chatId: chat.chatId,
      messageId: chat.messageId,
      folderId: chat.folderId,
      attachmentId: chat.attachmentId,
      index: '1',
      baseId: knowledgeBase.id,
      sourceId: knowledge.sourceId,
      documentId: knowledge.documentId,
    },
    markers: [
      a.id,
      'Acme Research',
      'acme-research-old',
      team.id,
      'Secret Lab',
      invitation.id,
      INVITEE,
      token,
      notification.id,
      sessionId,
      entryId,
      dataRequest.id,
      dataExport.id,
      credential.id,
      'Secret OpenAI',
      VAULT_SECRET,
      server.id,
      'Secret Ollama',
      'ollama.secret-lab.test',
      model.id,
      chat.chatId,
      chat.messageId,
      chat.folderId,
      chat.attachmentId,
      CHAT_TITLE,
      CHAT_TEXT,
      'secret-plan.pdf',
      knowledgeBase.id,
      'Secret Handbook',
      knowledge.sourceId,
      knowledge.documentId,
      KNOWLEDGE_FILE,
      KNOWLEDGE_PASSAGE,
      ...[olivia, adam, uma].flatMap((member) => [member.id, member.memberId, member.email]),
    ],
  }
}
