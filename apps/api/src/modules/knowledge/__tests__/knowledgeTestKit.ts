// SPDX-License-Identifier: AGPL-3.0-only
import { createHash } from 'node:crypto'

import {
  credentialDtoSchema,
  knowledgeBaseDtoSchema,
  vaultModelDtoSchema,
  vaultSettingsDtoSchema,
} from '@surefy/contracts'
import type { KnowledgeBaseDto, UsableModelDto } from '@surefy/contracts'

import { expectData, expectPage, request } from '../../../../test/helpers/request.js'

import type { TwoOrgSetup } from '../../../../test/helpers/orgSetup.js'
import type { KnowledgeFiles } from '../knowledge.types.js'
import type { MlService, ParsedDocument, ParseDocumentInput } from '@/integrations/ml/index.js'

export type { UsableModelDto }

/** Storage in memory: what was stored, the signed URLs asked for, what was deleted. */
export interface FakeFiles extends KnowledgeFiles {
  objects: Map<string, Buffer>
  uploads: string[]
  deleted: string[]
}

export function createFakeFiles(): FakeFiles {
  const objects = new Map<string, Buffer>()
  const uploads: string[] = []
  const deleted: string[] = []
  return {
    objects,
    uploads,
    deleted,
    signedUpload(key, options) {
      uploads.push(key)
      return Promise.resolve({
        url: `https://files.test/upload/${key}`,
        method: 'PUT',
        headers: { 'content-type': options.contentType },
        expiresAt: new Date(Date.now() + options.expiresInSeconds * 1000),
      })
    },
    signedDownload: (key) => Promise.resolve(`https://files.test/download/${key}`),
    inspect(key) {
      const bytes = objects.get(key)
      return Promise.resolve(
        bytes === undefined ? null : { sizeBytes: bytes.length, sha256: sha256Hex(bytes) },
      )
    },
    put(key, body) {
      objects.set(key, Buffer.from(body))
      return Promise.resolve()
    },
    read: (key) => Promise.resolve(objects.get(key) ?? null),
    delete(key) {
      deleted.push(key)
      objects.delete(key)
      return Promise.resolve()
    },
  }
}

export const sha256Hex = (bytes: Buffer | string): string =>
  createHash('sha256').update(bytes).digest('hex')

/** The ML service answering with a fixed document, or with whatever the function returns or throws. */
export interface FakeMl extends MlService {
  calls: ParseDocumentInput[]
}

export function createFakeMl(
  answer: ParsedDocument | ((input: ParseDocumentInput) => ParsedDocument),
): FakeMl {
  const calls: ParseDocumentInput[] = []
  return {
    calls,
    parseDocument(input) {
      calls.push(input)
      try {
        return Promise.resolve(typeof answer === 'function' ? answer(input) : answer)
      } catch (error) {
        return Promise.reject(error instanceof Error ? error : new Error('ml failed'))
      }
    },
  }
}

export const LEAVE_DOCUMENT: ParsedDocument = {
  title: 'Leave policy',
  language: 'en',
  pages: 2,
  sections: [
    {
      headingPath: ['Leave', 'Annual leave'],
      text: 'Every employee gets twenty-five days of annual leave per year.',
      pageFrom: 1,
      pageTo: 1,
    },
    {
      headingPath: ['Leave', 'Parental leave'],
      text: 'Parents may take sixteen weeks of parental leave at full pay.',
      pageFrom: 2,
      pageTo: 2,
    },
  ],
  tables: [],
  usedOcr: false,
}

const PROVIDER_KEY = 'test-provider-key-0001'

/** Adam (an Admin) adds an OpenAI key and makes its embedding model the organization's. */
export async function seedEmbeddingModel(setup: TwoOrgSetup): Promise<string> {
  const headers = setup.sessionOf(setup.a.members.adam)
  const vault = `/api/v1/orgs/${setup.a.id}/vault`
  expectData(
    await request(setup.app, 'POST', `${vault}/credentials`, {
      headers,
      payload: {
        scope: 'organization',
        name: 'OpenAI',
        providerKey: 'openai',
        secret: PROVIDER_KEY,
      },
    }),
    201,
    credentialDtoSchema,
  )
  const models = expectPage(
    await request(setup.app, 'GET', `${vault}/models`, { headers }),
    vaultModelDtoSchema,
  ).data
  const embedding = models.find((model) => model.type === 'embedding')
  if (embedding === undefined) throw new Error('no embedding model')
  expectData(
    await request(setup.app, 'PUT', `${vault}/settings`, {
      headers,
      payload: { embeddingModelId: embedding.id },
    }),
    200,
    vaultSettingsDtoSchema,
  )
  return embedding.modelKey
}

export const basesUrl = (orgId: string, path = ''): string =>
  `/api/v1/orgs/${orgId}/knowledge-bases${path}`

export type Who = 'olivia' | 'adam' | 'uma'

export async function createBase(
  setup: TwoOrgSetup,
  who: Who,
  payload: Record<string, unknown> = {},
): Promise<KnowledgeBaseDto> {
  return expectData(
    await request(setup.app, 'POST', basesUrl(setup.a.id), {
      headers: setup.sessionOf(setup.a.members[who]),
      payload: { name: 'HR Policies', ...payload },
    }),
    201,
    knowledgeBaseDtoSchema,
  )
}
