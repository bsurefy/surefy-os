// SPDX-License-Identifier: AGPL-3.0-only
import { randomUUID } from 'node:crypto'

import {
  chatAttachmentUploadDtoSchema,
  chatDtoSchema,
  chatFolderDtoSchema,
  chatMessageDtoSchema,
  credentialDtoSchema,
  vaultModelDtoSchema,
} from '@surefy/contracts'
import type { ChatDto, ChatMessageDto, SendChatMessageInput } from '@surefy/contracts'

import { testKey } from '../../../../test/fixtures/fakeAi.js'
import { expectData, expectPage, request } from '../../../../test/helpers/request.js'

import type { TwoOrgSetup } from '../../../../test/helpers/orgSetup.js'
import type { TenantContext } from '@/types/context.js'

export type Who = 'olivia' | 'adam' | 'uma'

export const orgUrl = (setup: TwoOrgSetup, path: string, orgId = setup.a.id) =>
  `/api/v1/orgs/${orgId}${path}`

export const as = (setup: TwoOrgSetup, who: Who = 'uma') => setup.sessionOf(setup.a.members[who])

/** An organization key for an OpenAI-compatible proxy with its first model enabled; returns the key. */
export async function enableProxyModel(setup: TwoOrgSetup): Promise<string> {
  const vault = (path: string) => orgUrl(setup, `/vault${path}`)
  const headers = as(setup, 'adam')
  expectData(
    await request(setup.app, 'POST', vault('/credentials'), {
      headers,
      payload: {
        scope: 'organization',
        name: 'Proxy',
        providerKey: 'openai_compatible',
        secret: testKey('chats'),
        baseUrl: 'https://llm-proxy.acme.test/v1',
      },
    }),
    201,
    credentialDtoSchema,
  )
  const [model] = expectPage(
    await request(setup.app, 'GET', vault('/models'), {
      headers,
      query: { providerKey: 'openai_compatible' },
    }),
    vaultModelDtoSchema,
  ).data
  if (model === undefined) throw new Error('the proxy lists models')
  if (!model.isEnabled) {
    expectData(
      await request(setup.app, 'PATCH', vault(`/models/${model.id}`), {
        headers,
        payload: { isEnabled: true },
      }),
      200,
      vaultModelDtoSchema,
    )
  }
  return model.modelKey
}

/** The chunks of an AI SDK UI message stream body (`data: {json}` events). */
export function chunksOf(body: string): Record<string, unknown>[] {
  return body
    .split('\n\n')
    .map((event) => event.replace(/^data: /, '').trim())
    .filter((data) => data !== '' && data !== '[DONE]')
    .map((data) => JSON.parse(data) as Record<string, unknown>)
}

export const send = (
  setup: TwoOrgSetup,
  chatId: string,
  payload: SendChatMessageInput,
  who: Who = 'uma',
) =>
  request(setup.app, 'POST', orgUrl(setup, `/chats/${chatId}/messages`), {
    headers: as(setup, who),
    payload,
  })

/** Sends the first message of a new chat and returns its id; fails the test on a non-200. */
export async function startChat(
  setup: TwoOrgSetup,
  text = 'What is the refund policy?',
  extra: Partial<Extract<SendChatMessageInput, { trigger: 'submit' }>> = {},
  who: Who = 'uma',
): Promise<string> {
  const chatId = randomUUID()
  const response = await send(
    setup,
    chatId,
    { trigger: 'submit', text, attachmentIds: [], ...extra },
    who,
  )
  if (response.statusCode !== 200) throw new Error(`send failed: ${response.body}`)
  return chatId
}

export async function thread(
  setup: TwoOrgSetup,
  chatId: string,
  who: Who = 'uma',
): Promise<ChatMessageDto[]> {
  return expectPage(
    await request(setup.app, 'GET', orgUrl(setup, `/chats/${chatId}/messages`), {
      headers: as(setup, who),
    }),
    chatMessageDtoSchema,
  ).data
}

export async function getChat(
  setup: TwoOrgSetup,
  chatId: string,
  who: Who = 'uma',
): Promise<ChatDto> {
  return expectData(
    await request(setup.app, 'GET', orgUrl(setup, `/chats/${chatId}`), { headers: as(setup, who) }),
    200,
    chatDtoSchema,
  )
}

export async function createFolder(setup: TwoOrgSetup, name: string, who: Who = 'uma') {
  return expectData(
    await request(setup.app, 'POST', orgUrl(setup, '/chat-folders'), {
      headers: as(setup, who),
      payload: { name },
    }),
    201,
    chatFolderDtoSchema,
  )
}

export async function requestUpload(
  setup: TwoOrgSetup,
  chatId: string,
  file: { fileName: string; contentType: string; sizeBytes: number },
  who: Who = 'uma',
) {
  return expectData(
    await request(setup.app, 'POST', orgUrl(setup, `/chats/${chatId}/attachments`), {
      headers: as(setup, who),
      payload: file,
    }),
    201,
    chatAttachmentUploadDtoSchema,
  )
}

/** PUTs bytes to a signed upload URL (no session). */
export function putBytes(
  setup: TwoOrgSetup,
  signedUrl: string,
  bytes: Buffer,
  contentType: string,
) {
  const url = new URL(signedUrl)
  return setup.app.inject({
    method: 'PUT',
    url: `${url.pathname}${url.search}`,
    headers: { 'content-type': contentType },
    payload: bytes,
  })
}

/** Enables the proxy's second model, for tests that switch models; returns its key. */
export async function enableSecondModel(setup: TwoOrgSetup): Promise<string> {
  const headers = as(setup, 'adam')
  const models = expectPage(
    await request(setup.app, 'GET', orgUrl(setup, '/vault/models'), {
      headers,
      query: { providerKey: 'openai_compatible' },
    }),
    vaultModelDtoSchema,
  ).data
  const second = models.find((model) => !model.isEnabled)
  if (second === undefined) throw new Error('the proxy lists a second model')
  expectData(
    await request(setup.app, 'PATCH', orgUrl(setup, `/vault/models/${second.id}`), {
      headers,
      payload: { isEnabled: true },
    }),
    200,
    vaultModelDtoSchema,
  )
  return second.modelKey
}

/** What `app.authorize()` puts on `request.tenant`, for tests that call services directly. */
export async function tenantOf(setup: TwoOrgSetup, who: Who = 'uma'): Promise<TenantContext> {
  const member = setup.a.members[who]
  const access = await setup.container.modules.access.service.forMember(setup.a.id, member.id)
  if (access === null) throw new Error('member has access')
  return {
    orgId: setup.a.id,
    userId: member.id,
    requestId: 'test-request',
    via: 'user',
    role: access.role,
    teamIds: access.teamIds,
    access,
  }
}

/** The body of the latest answer call (not the title call) the fake provider received. */
export function lastModelBody(setup: TwoOrgSetup): {
  messages: { role: string; content: unknown }[]
} {
  const calls = setup.ai.calls.filter(
    (call) =>
      call.url.endsWith('/chat/completions') && (call.body as { stream?: boolean }).stream === true,
  )
  const body = calls.at(-1)?.body
  if (body === undefined) throw new Error('no model call')
  return body as { messages: { role: string; content: unknown }[] }
}
