// SPDX-License-Identifier: AGPL-3.0-only
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { ERROR_CODES } from '@surefy/contracts'

import {
  chunksOf,
  enableLocalModel,
  enableProxyModel,
  lastModelBody,
  send,
  thread,
} from './chatsTestKit.js'
import { setupTwoOrgs } from '../../../../test/helpers/orgSetup.js'
import { expectError } from '../../../../test/helpers/request.js'
import { createFakePii } from '../../guard/__tests__/guardTestKit.js'

import type { TwoOrgSetup } from '../../../../test/helpers/orgSetup.js'

const submit = (text: string, modelKey?: string) => ({
  trigger: 'submit' as const,
  text,
  attachmentIds: [],
  ...(modelKey === undefined ? {} : { modelKey }),
})

const piiMaskedEvents = (setup: TwoOrgSetup, messageId: string) =>
  setup.db.system('test', (tx) =>
    tx.execute<{ source_module: string; pii_masked: boolean }>(
      sql`select source_module, pii_masked from usage_events
          where source_ref_id = ${messageId} order by source_module, dedupe_key`,
    ),
  )

describe('the personal-data filter on a chat message', () => {
  it('masks the question before a cloud model reads it and says so on the answer', async () => {
    const pii = createFakePii()
    const setup = await setupTwoOrgs({ ml: pii })
    await enableProxyModel(setup)
    const chatId = randomUUID()

    const response = await send(setup, chatId, submit('Please write to ana@example.com today'))

    expect(response.statusCode).toBe(200)
    const sent = JSON.stringify(lastModelBody(setup).messages)
    expect(sent).toContain('Please write to [EMAIL] today')
    expect(sent).not.toContain('ana@example.com')
    const chunks = chunksOf(response.body)
    expect(chunks.find((chunk) => chunk.type === 'data-model')).toMatchObject({
      data: { piiMasked: true },
    })
    const [question, answer] = await thread(setup, chatId)
    // the person's own message is kept as they wrote it; only what left is hidden
    expect(question?.parts.parts).toEqual([
      { type: 'text', text: 'Please write to ana@example.com today' },
    ])
    expect(answer).toMatchObject({ status: 'complete', piiMasked: true })
    const events = await piiMaskedEvents(setup, answer?.id ?? '')
    expect(events.rows.map((row) => row.pii_masked)).toEqual([true, true])
  })

  it('leaves a message without personal data as it was', async () => {
    const setup = await setupTwoOrgs({ ml: createFakePii() })
    await enableProxyModel(setup)
    const chatId = randomUUID()
    const response = await send(setup, chatId, submit('What is the refund policy?'))
    expect(response.statusCode).toBe(200)
    expect(JSON.stringify(lastModelBody(setup).messages)).toContain('What is the refund policy?')
    const [, answer] = await thread(setup, chatId)
    expect(answer).toMatchObject({ piiMasked: false })
    const events = await piiMaskedEvents(setup, answer?.id ?? '')
    expect(events.rows.every((row) => !row.pii_masked)).toBe(true)
  })

  it('refuses a blocked type before anything is sent and keeps the failed answer', async () => {
    const setup = await setupTwoOrgs({ ml: createFakePii() })
    await enableProxyModel(setup)
    const chatId = randomUUID()

    const response = await send(setup, chatId, submit('My card is 4111-1111-1111-1111'))

    expectError(response, 422, 'GUARD_PII_BLOCKED')
    expect(setup.ai.calls.filter((call) => call.url.endsWith('/chat/completions'))).toHaveLength(0)
    const [question, answer] = await thread(setup, chatId)
    expect(question?.status).toBe('complete')
    expect(answer).toMatchObject({ status: 'failed', errorCode: 'GUARD_PII_BLOCKED' })
  })

  it('does not send anything when the personal-data check cannot run', async () => {
    const pii = createFakePii()
    pii.failWith = new Error('ML service down')
    const setup = await setupTwoOrgs({ ml: pii })
    await enableProxyModel(setup)
    const chatId = randomUUID()

    const response = await send(setup, chatId, submit('Hello there'))

    expectError(response, 500, ERROR_CODES.INTERNAL_ERROR)
    expect(setup.ai.calls.filter((call) => call.url.endsWith('/chat/completions'))).toHaveLength(0)
  })

  it('skips the filter for a local model: the data stays on the network', async () => {
    const pii = createFakePii()
    const setup = await setupTwoOrgs({ ml: pii })
    const local = await enableLocalModel(setup)
    const chatId = randomUUID()

    const response = await send(
      setup,
      chatId,
      submit('Mail ana@example.com, card 4111-1111-1111-1111', local),
    )

    expect(response.statusCode).toBe(200)
    expect(pii.calls).toHaveLength(0)
    expect(JSON.stringify(setup.ai.calls.map((call) => call.body))).toContain('ana@example.com')
    const [, answer] = await thread(setup, chatId)
    expect(answer).toMatchObject({ piiMasked: false, dataLocation: 'local' })
  })
})
