// SPDX-License-Identifier: AGPL-3.0-only
import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { QUEUES } from '@/constants/queues.js'
import { chatAttachments, chats, vaultModels } from '@/database/tables/index.js'
import { chatAttachmentDtoSchema, ERROR_CODES } from '@surefy/contracts'

import { setupTwoOrgs, type TwoOrgSetup } from '../../../../test/helpers/orgSetup.js'
import {
  expectData,
  expectError,
  expectNoContent,
  request,
} from '../../../../test/helpers/request.js'
import { createChatsModule } from '../index.js'
import {
  as,
  enableProxyModel,
  lastModelBody,
  orgUrl,
  putBytes,
  requestUpload,
  send,
  startChat,
  thread,
} from './chatsTestKit.js'

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(32, 1),
])
const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n')

const completeUrl = (setup: TwoOrgSetup, chatId: string, attachmentId: string) =>
  orgUrl(setup, `/chats/${chatId}/attachments/${attachmentId}/complete`)

async function upload(
  setup: TwoOrgSetup,
  chatId: string,
  file: { fileName: string; contentType: string; bytes: Buffer },
) {
  const { attachment, upload: target } = await requestUpload(setup, chatId, {
    fileName: file.fileName,
    contentType: file.contentType,
    sizeBytes: file.bytes.length,
  })
  const put = await putBytes(setup, target.url, file.bytes, file.contentType)
  expect(put.statusCode, put.body).toBe(204)
  return attachment
}

const complete = async (setup: TwoOrgSetup, chatId: string, attachmentId: string) =>
  expectData(
    await request(setup.app, 'POST', completeUrl(setup, chatId, attachmentId), {
      headers: as(setup),
    }),
    200,
    chatAttachmentDtoSchema,
  )

describe('attachments', () => {
  it('uploads a text file, reads it for the model and sends it with a message', async () => {
    const setup = await setupTwoOrgs()
    await enableProxyModel(setup)
    const chatId = randomUUID()
    const text = Buffer.from('Refunds: annual plans can be cancelled within 14 days.')
    const pending = await upload(setup, chatId, {
      fileName: 'policy.txt',
      contentType: 'text/plain',
      bytes: text,
    })
    expect(pending).toMatchObject({ status: 'uploading', messageId: null, kind: 'document' })
    // the first attachment created the chat, which stays hidden until a message exists
    expect(
      await setup.db.tenant(setup.a.id, (tx) =>
        tx.select().from(chats).where(eq(chats.id, chatId)),
      ),
    ).toHaveLength(1)
    const list = await request(setup.app, 'GET', orgUrl(setup, '/chats'), { headers: as(setup) })
    expect(list.json<{ data: unknown[] }>().data).toEqual([])

    const ready = await complete(setup, chatId, pending.id)
    expect(ready).toMatchObject({ status: 'ready', errorCode: null, sizeBytes: text.length })
    // completing again changes nothing
    expect((await complete(setup, chatId, pending.id)).status).toBe('ready')

    const response = await send(setup, chatId, {
      trigger: 'submit',
      text: 'Summarize the attachment',
      attachmentIds: [pending.id],
    })
    expect(response.statusCode).toBe(200)
    const [question] = await thread(setup, chatId)
    expect(question?.parts.parts).toContainEqual({
      type: 'file',
      attachmentId: pending.id,
      mediaType: 'text/plain',
      name: 'policy.txt',
    })
    const sent = JSON.stringify(lastModelBody(setup).messages)
    expect(sent).toContain('[Attachment: policy.txt]')
    expect(sent).toContain('annual plans can be cancelled within 14 days')
    // it belongs to the message now: it cannot be removed or sent again
    const row = await setup.db.tenant(setup.a.id, (tx) =>
      tx.select().from(chatAttachments).where(eq(chatAttachments.id, pending.id)),
    )
    expect(row[0]?.messageId).toBe(question?.id)
    expect(row[0]?.sha256?.length).toBe(32)
    expectError(
      await request(
        setup.app,
        'DELETE',
        orgUrl(setup, `/chats/${chatId}/attachments/${pending.id}`),
        {
          headers: as(setup),
        },
      ),
      409,
      ERROR_CODES.CHAT_MESSAGE_STATE_INVALID,
    )
    expectError(
      await send(setup, chatId, { trigger: 'submit', text: 'Again', attachmentIds: [pending.id] }),
      404,
      ERROR_CODES.CHAT_ATTACHMENT_NOT_FOUND,
    )
  })

  it('checks the file type from the bytes, and lets a failed file be retried', async () => {
    const setup = await setupTwoOrgs()
    await enableProxyModel(setup)
    const chatId = randomUUID()
    // announced as a PNG, but not one
    const fake = await upload(setup, chatId, {
      fileName: 'photo.png',
      contentType: 'image/png',
      bytes: Buffer.alloc(PNG.length, 'x'),
    })
    const failed = await complete(setup, chatId, fake.id)
    expect(failed).toMatchObject({ status: 'failed', errorCode: 'CHAT_ATTACHMENT_UNSUPPORTED' })
    expectError(
      await send(setup, chatId, { trigger: 'submit', text: 'Look', attachmentIds: [fake.id] }),
      409,
      ERROR_CODES.CHAT_ATTACHMENT_NOT_READY,
    )

    // retry: a new signed URL for the same row, then the right bytes
    const retried = expectData(
      await request(
        setup.app,
        'POST',
        orgUrl(setup, `/chats/${chatId}/attachments/${fake.id}/retry`),
        { headers: as(setup) },
      ),
      200,
      (await import('@surefy/contracts')).chatAttachmentUploadDtoSchema,
    )
    expect(retried.attachment).toMatchObject({ id: fake.id, status: 'uploading', errorCode: null })
    expect((await putBytes(setup, retried.upload.url, PNG, 'image/png')).statusCode).toBe(204)
    const good = await complete(setup, chatId, fake.id)
    expect(good).toMatchObject({ status: 'ready', kind: 'image', errorCode: null })
    expectNoContent(
      await request(setup.app, 'DELETE', orgUrl(setup, `/chats/${chatId}/attachments/${good.id}`), {
        headers: as(setup),
      }),
    )
    expectError(
      await request(setup.app, 'POST', completeUrl(setup, chatId, good.id), { headers: as(setup) }),
      404,
      ERROR_CODES.CHAT_ATTACHMENT_NOT_FOUND,
    )
  })

  it('sends images only to models that read them', async () => {
    const setup = await setupTwoOrgs()
    const modelKey = await enableProxyModel(setup)
    const chatId = randomUUID()
    const image = await upload(setup, chatId, {
      fileName: 'chart.png',
      contentType: 'image/png',
      bytes: PNG,
    })
    await complete(setup, chatId, image.id)
    const message = {
      trigger: 'submit' as const,
      text: 'What is in it?',
      attachmentIds: [image.id],
    }
    expectError(await send(setup, chatId, message), 422, ERROR_CODES.CHAT_MODEL_NO_VISION)

    await setup.db.system('test', (tx) =>
      tx
        .update(vaultModels)
        .set({ supportsVision: true })
        .where(eq(vaultModels.modelKey, modelKey)),
    )
    expect((await send(setup, chatId, message)).statusCode).toBe(200)
    expect(JSON.stringify(lastModelBody(setup).messages)).toContain('image_url')
  })

  it('refuses files over the limit or of another type, and unsent attachments of other chats', async () => {
    const setup = await setupTwoOrgs()
    await enableProxyModel(setup)
    const chatId = randomUUID()
    const url = (id: string) => orgUrl(setup, `/chats/${id}/attachments`)
    expectError(
      await request(setup.app, 'POST', url(chatId), {
        headers: as(setup),
        payload: { fileName: 'huge.png', contentType: 'image/png', sizeBytes: 11 * 1024 * 1024 },
      }),
      422,
      ERROR_CODES.CHAT_ATTACHMENT_TOO_LARGE,
    )
    expectError(
      await request(setup.app, 'POST', url(chatId), {
        headers: as(setup),
        payload: { fileName: 'a.zip', contentType: 'application/zip', sizeBytes: 10 },
      }),
      422,
      ERROR_CODES.VALIDATION_FAILED,
    )
    // another person's chat id, and another chat's attachment
    const adamsChat = await startChat(setup, 'Adam’s chat', {}, 'adam')
    expectError(
      await request(setup.app, 'POST', url(adamsChat), {
        headers: as(setup),
        payload: { fileName: 'a.txt', contentType: 'text/plain', sizeBytes: 3 },
      }),
      404,
      ERROR_CODES.CHAT_NOT_FOUND,
    )
    const mine = await upload(setup, chatId, {
      fileName: 'a.txt',
      contentType: 'text/plain',
      bytes: Buffer.from('abc'),
    })
    await complete(setup, chatId, mine.id)
    expectError(
      await send(setup, randomUUID(), {
        trigger: 'submit',
        text: 'Use it elsewhere',
        attachmentIds: [mine.id],
      }),
      404,
      ERROR_CODES.CHAT_ATTACHMENT_NOT_FOUND,
    )
  })

  it('accepts bytes only at an authentic, unexpired signed URL', async () => {
    const setup = await setupTwoOrgs()
    const chatId = randomUUID()
    const { upload: target, attachment } = await requestUpload(setup, chatId, {
      fileName: 'a.txt',
      contentType: 'text/plain',
      sizeBytes: 3,
    })
    const url = new URL(target.url)
    const put = (params: Record<string, string>, bytes = Buffer.from('abc')) => {
      const query = new URLSearchParams(url.searchParams)
      for (const [key, value] of Object.entries(params)) query.set(key, value)
      return setup.app.inject({
        method: 'PUT',
        url: `${url.pathname}?${query.toString()}`,
        headers: { 'content-type': 'text/plain' },
        payload: bytes,
      })
    }
    expect((await put({ signature: 'a'.repeat(64) })).statusCode).toBe(404)
    expect((await put({ expires: '1000' })).statusCode).toBe(404)
    expect((await put({ org: setup.b.id })).statusCode).toBe(404)
    // more bytes than announced
    expect((await put({}, Buffer.from('abcd'))).statusCode).toBe(422)
    expect((await put({})).statusCode).toBe(204)
    expect(attachment.status).toBe('uploading')
    // a missing upload cannot be completed
    const empty = await requestUpload(setup, chatId, {
      fileName: 'b.txt',
      contentType: 'text/plain',
      sizeBytes: 3,
    })
    expect(await complete(setup, chatId, empty.attachment.id)).toMatchObject({
      status: 'failed',
      errorCode: 'CHAT_ATTACHMENT_UPLOAD_FAILED',
    })
  })

  it('reads a PDF in a job and fails an unreadable one', async () => {
    const setup = await setupTwoOrgs()
    await enableProxyModel(setup)
    const chatId = randomUUID()
    const pdf = await upload(setup, chatId, {
      fileName: 'report.pdf',
      contentType: 'application/pdf',
      bytes: PDF,
    })
    expect(await complete(setup, chatId, pdf.id)).toMatchObject({ status: 'processing' })
    const jobs = await setup.container.queues.get(QUEUES.KNOWLEDGE_INGESTION).getJobs(['waiting'])
    expect(jobs.map((job) => job.name)).toContain('processChatAttachment')

    const { container } = setup
    const processor = (extract: () => Promise<{ text: string; pageCount: number | null }>) =>
      createChatsModule({
        db: container.db,
        queues: container.queues,
        logger: container.logger,
        storage: container.integrations.storage,
        encryptionKey: setup.config.crypto.encryptionKey,
        gateway: container.modules.modelGateway.service,
        models: container.modules.vault.grants.modelsRepository,
        parser: { extract },
      }).attachments
    await processor(() => Promise.resolve({ text: 'Quarterly numbers', pageCount: 4 })).process(
      setup.a.id,
      pdf.id,
    )
    const [row] = await setup.db.tenant(setup.a.id, (tx) =>
      tx.select().from(chatAttachments).where(eq(chatAttachments.id, pdf.id)),
    )
    expect(row).toMatchObject({ status: 'ready', extractedText: 'Quarterly numbers', pageCount: 4 })

    const second = await upload(setup, chatId, {
      fileName: 'broken.pdf',
      contentType: 'application/pdf',
      bytes: PDF,
    })
    await complete(setup, chatId, second.id)
    await processor(() => Promise.reject(new Error('unreadable'))).process(setup.a.id, second.id)
    const [broken] = await setup.db.tenant(setup.a.id, (tx) =>
      tx.select().from(chatAttachments).where(eq(chatAttachments.id, second.id)),
    )
    expect(broken).toMatchObject({ status: 'failed', errorCode: 'CHAT_ATTACHMENT_UNSUPPORTED' })
  })

  it('cleans up attachments that were never sent, and chats that stayed empty', async () => {
    const setup = await setupTwoOrgs()
    await enableProxyModel(setup)
    const { storage } = setup.container.integrations
    const abandonedChat = randomUUID()
    const abandoned = await upload(setup, abandonedChat, {
      fileName: 'old.txt',
      contentType: 'text/plain',
      bytes: Buffer.from('abc'),
    })
    const freshChat = randomUUID()
    const fresh = await upload(setup, freshChat, {
      fileName: 'new.txt',
      contentType: 'text/plain',
      bytes: Buffer.from('abc'),
    })
    const sentChat = await startChat(setup, 'Hello')
    const sent = await upload(setup, sentChat, {
      fileName: 'sent.txt',
      contentType: 'text/plain',
      bytes: Buffer.from('abc'),
    })
    await complete(setup, sentChat, sent.id)
    await send(setup, sentChat, { trigger: 'submit', text: 'See file', attachmentIds: [sent.id] })

    const old = new Date(Date.now() - 25 * 3_600_000)
    await setup.db.system('test', async (tx) => {
      await tx
        .update(chatAttachments)
        .set({ createdAt: old })
        .where(eq(chatAttachments.id, abandoned.id))
      await tx
        .update(chatAttachments)
        .set({ createdAt: old })
        .where(eq(chatAttachments.id, sent.id))
      await tx.update(chats).set({ createdAt: old }).where(eq(chats.id, abandonedChat))
    })
    const result = await setup.container.modules.chats.maintenance.cleanupAttachments()
    expect(result).toEqual({ attachments: 1, chats: 1 })

    const remaining = await setup.db.tenant(setup.a.id, (tx) => tx.select().from(chatAttachments))
    expect(remaining.map((row) => row.id).sort((a, b) => a.localeCompare(b))).toEqual(
      [fresh.id, sent.id].sort((a, b) => a.localeCompare(b)),
    )
    const chatIds = (await setup.db.tenant(setup.a.id, (tx) => tx.select().from(chats))).map(
      (c) => c.id,
    )
    expect(chatIds).toContain(freshChat) // its attachment is still younger than a day
    expect(chatIds).toContain(sentChat)
    expect(chatIds).not.toContain(abandonedChat)
    await expect(
      storage.get(`orgs/${setup.a.id}/chats/${abandonedChat}/attachments/${abandoned.id}`),
    ).rejects.toBeDefined()
  })
})
