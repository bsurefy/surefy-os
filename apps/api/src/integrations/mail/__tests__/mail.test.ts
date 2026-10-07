// SPDX-License-Identifier: AGPL-3.0-only
import { pino } from 'pino'
import { describe, expect, it, vi } from 'vitest'

import { validEnv } from '@/core/config/__tests__/env.fixture.js'
import { parseConfig } from '@/core/config/index.js'

import {
  ConsoleMailProvider,
  createMail,
  MailRejectedError,
  MailUnavailableError,
  SmtpMailProvider,
  type MailMessage,
  type MailProvider,
  type SmtpTransport,
} from '../index.js'

const logger = pino({ level: 'silent' })
const smtp = { host: 'smtp.example.test', port: 587, secure: false }
const message: MailMessage = {
  to: 'person@example.test',
  subject: 'Hello',
  html: '<p>Hello</p>',
  text: 'Hello',
}

const fakeTransport = (sendMail: SmtpTransport['sendMail'] = () => Promise.resolve({})) => ({
  sendMail: vi.fn(sendMail),
  close: vi.fn(),
})

const vendorError = (fields: Record<string, unknown>) => Object.assign(new Error('vendor'), fields)

// The shared suite every provider passes (integrations.md, §1).
const providers: [string, () => MailProvider][] = [
  ['console', () => new ConsoleMailProvider({ from: 'SurefyOS <no-reply@example.test>', logger })],
  [
    'smtp',
    () => new SmtpMailProvider({ from: 'no-reply@example.test', smtp, transport: fakeTransport() }),
  ],
]

describe.each(providers)('%s mail provider', (_name, build) => {
  it('sends a message and closes', async () => {
    const provider = build()
    await expect(provider.send(message)).resolves.toBeUndefined()
    await expect(provider.close()).resolves.toBeUndefined()
  })
})

describe('createMail', () => {
  it('selects the provider from MAIL_DRIVER', () => {
    expect(createMail(parseConfig('api', validEnv), logger).driver).toBe('console')
    const config = parseConfig('api', {
      ...validEnv,
      MAIL_DRIVER: 'smtp',
      SMTP_HOST: 'smtp.example.test',
    })
    expect(createMail(config, logger).driver).toBe('smtp')
  })
})

describe('SmtpMailProvider', () => {
  it('sends from the configured address, with the reply-to only when given', async () => {
    const transport = fakeTransport()
    const provider = new SmtpMailProvider({ from: 'no-reply@example.test', smtp, transport })
    await provider.send(message)
    await provider.send({ ...message, replyTo: 'owner@example.test' })
    expect(transport.sendMail.mock.calls.map(([mail]) => mail)).toEqual([
      { from: 'no-reply@example.test', ...message },
      { from: 'no-reply@example.test', ...message, replyTo: 'owner@example.test' },
    ])
  })

  it('maps a permanent refusal to MailRejectedError and anything else to MailUnavailableError', async () => {
    const rejecting = new SmtpMailProvider({
      from: 'no-reply@example.test',
      smtp,
      transport: fakeTransport(() => Promise.reject(vendorError({ responseCode: 550 }))),
    })
    await expect(rejecting.send(message)).rejects.toBeInstanceOf(MailRejectedError)

    for (const failure of [
      vendorError({ responseCode: 421 }),
      vendorError({ code: 'ETIMEDOUT' }),
    ]) {
      const failing = new SmtpMailProvider({
        from: 'no-reply@example.test',
        smtp,
        transport: fakeTransport(() => Promise.reject(failure)),
      })
      await expect(failing.send(message)).rejects.toBeInstanceOf(MailUnavailableError)
    }
  })
})
