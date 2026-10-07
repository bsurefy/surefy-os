// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import {
  ERROR_CODES,
  knowledgeFileUploadDtoSchema,
  knowledgeSourceDtoSchema,
} from '@surefy/contracts'

import {
  basesUrl,
  createBase,
  createFakeMl,
  LEAVE_DOCUMENT,
  seedEmbeddingModel,
  sha256Hex,
} from './knowledgeTestKit.js'
import { setupTwoOrgs } from '../../../../test/helpers/orgSetup.js'
import { expectData, expectError, request } from '../../../../test/helpers/request.js'

const BYTES = Buffer.from('%PDF-1.7 the real leave policy')

const pathOf = (url: string): string => {
  const parsed = new URL(url)
  return parsed.pathname + parsed.search
}

/** The real storage and files route: no fake, the browser's PUT goes through the signed link. */
async function setup() {
  const ml = createFakeMl(LEAVE_DOCUMENT)
  const two = await setupTwoOrgs({ ml })
  await seedEmbeddingModel(two)
  const base = await createBase(two, 'adam')
  const headers = two.sessionOf(two.a.members.adam)
  const requestUpload = async () =>
    expectData(
      await request(two.app, 'POST', basesUrl(two.a.id, `/${base.id}/sources/files`), {
        headers,
        payload: {
          fileName: 'leave-policy.pdf',
          contentType: 'application/pdf',
          sizeBytes: BYTES.length,
          sha256: sha256Hex(BYTES),
        },
      }),
      201,
      knowledgeFileUploadDtoSchema,
    )
  const complete = (sourceId: string) =>
    request(two.app, 'POST', basesUrl(two.a.id, `/${base.id}/sources/${sourceId}/complete`), {
      headers,
    })
  return { two, base, headers, ml, requestUpload, complete }
}

describe('uploading through storage', () => {
  it('uploads to the signed link, completes, and the ML service reads it back through a signed download', async () => {
    const { two, base, ml, requestUpload, complete } = await setup()
    const created = await requestUpload()
    const put = await two.app.inject({
      method: 'PUT',
      url: pathOf(created.upload.url),
      headers: created.upload.headers,
      payload: BYTES,
    })
    expect(put.statusCode, put.body).toBe(204)

    const source = expectData(await complete(created.source.id), 200, knowledgeSourceDtoSchema)
    expect(source.status).toBe('queued')

    const documents = await two.container.modules.knowledge.sources.listDocuments(
      { orgId: two.a.id, userId: two.a.members.adam.id, role: 'admin', teamIds: [] },
      base.id,
      created.source.id,
      { limit: 10 },
    )
    const documentId = documents.items[0]?.id ?? ''
    await two.container.modules.knowledge.ingestion.ingestDocument(two.a.id, documentId, {
      resume: false,
    })
    const [call] = ml.calls
    // the URL the ML service gets downloads exactly the bytes that were uploaded
    const download = await two.app.inject({ method: 'GET', url: pathOf(call?.fileUrl ?? '') })
    expect(download.statusCode).toBe(200)
    expect(download.rawPayload.equals(BYTES)).toBe(true)
  })

  it('fails a source whose upload is not the announced file', async () => {
    const { two, requestUpload, complete } = await setup()
    const created = await requestUpload()
    // same size, different bytes: the signed link accepts it, the hash check does not
    const other = Buffer.alloc(BYTES.length, 1)
    const put = await two.app.inject({
      method: 'PUT',
      url: pathOf(created.upload.url),
      headers: created.upload.headers,
      payload: other,
    })
    expect(put.statusCode).toBe(204)
    const failed = expectData(await complete(created.source.id), 200, knowledgeSourceDtoSchema)
    expect(failed).toMatchObject({
      status: 'failed',
      errorCode: ERROR_CODES.KNOWLEDGE_UPLOAD_CORRUPTED,
    })
  })

  it('asks for the upload first when nothing was sent', async () => {
    const { requestUpload, complete } = await setup()
    const created = await requestUpload()
    expectError(await complete(created.source.id), 409, ERROR_CODES.KNOWLEDGE_SOURCE_STATE_INVALID)
  })
})
