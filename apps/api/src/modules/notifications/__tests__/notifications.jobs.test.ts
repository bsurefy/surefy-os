// SPDX-License-Identifier: AGPL-3.0-only
import { UnrecoverableError, type Job } from 'bullmq'
import { pino } from 'pino'
import { describe, expect, it, vi } from 'vitest'

import { MailRejectedError, MailUnavailableError } from '@/integrations/mail/index.js'

import { RecordingMailProvider } from './notificationsTestKit.js'
import { NotificationEmailsService } from '../notificationEmails/notificationEmails.service.js'
import { createSendEmailJob } from '../notifications.jobs.js'

import type { EmailDeliveryListener } from '../notifications.types.js'
import type { JobRuntime } from '@/core/queue/index.js'

const runtime = { logger: pino({ level: 'silent' }) } as unknown as JobRuntime
const job = (data: unknown, attemptsMade = 0) =>
  ({ id: '1', data, attemptsMade, opts: { attempts: 3 } }) as unknown as Job<unknown>
const payload = {
  template: 'passwordReset',
  to: 'person@example.test',
  url: 'https://app.example.test/reset?token=abc',
}

const setup = () => {
  const mail = new RecordingMailProvider()
  const listener = vi.fn<EmailDeliveryListener>(() => Promise.resolve())
  const sendEmailJob = createSendEmailJob(
    new NotificationEmailsService({ mail, appName: 'SurefyOS' }),
    [listener],
  )
  return { mail, listener, sendEmailJob, run: sendEmailJob.bind(runtime) }
}

describe('sendEmail job', () => {
  it('lives on the email queue', () => {
    const { sendEmailJob } = setup()
    expect([sendEmailJob.queue, sendEmailJob.name]).toEqual(['email', 'sendEmail'])
  })

  it('renders the template and sends it to the recipient', async () => {
    const { mail, run } = setup()
    await run(job(payload))
    expect(mail.sent).toEqual([
      expect.objectContaining({ to: 'person@example.test', subject: 'Reset your password' }),
    ])
    expect(mail.sent[0]?.text).toContain(payload.url)
  })

  it('sends again when the same job is retried (duplicates are stopped by the job ID)', async () => {
    const { mail, run } = setup()
    await run(job(payload))
    await run(job(payload))
    expect(mail.sent).toHaveLength(2)
  })

  it('does not retry an invalid payload or a permanent refusal', async () => {
    const { mail, run } = setup()
    await expect(run(job({ ...payload, url: 'javascript:alert(1)' }))).rejects.toBeInstanceOf(
      UnrecoverableError,
    )
    mail.failWith = new MailRejectedError(550)
    await expect(run(job(payload))).rejects.toBeInstanceOf(UnrecoverableError)
  })

  it('lets BullMQ retry when the mail server is unavailable', async () => {
    const { mail, run } = setup()
    mail.failWith = new MailUnavailableError()
    await expect(run(job(payload))).rejects.toBeInstanceOf(MailUnavailableError)
  })

  it('tells the delivery listeners how the send ended', async () => {
    const { mail, listener, run } = setup()
    await run(job(payload))
    expect(listener).toHaveBeenLastCalledWith({ payload, status: 'sent' })

    mail.failWith = new MailUnavailableError()
    await expect(run(job(payload, 0))).rejects.toBeInstanceOf(MailUnavailableError)
    expect(listener).toHaveBeenCalledTimes(1) // BullMQ retries: not failed yet
    await expect(run(job(payload, 2))).rejects.toBeInstanceOf(MailUnavailableError)
    expect(listener).toHaveBeenLastCalledWith({ payload, status: 'failed' })

    mail.failWith = new MailRejectedError(550)
    await expect(run(job(payload))).rejects.toBeInstanceOf(UnrecoverableError)
    expect(listener).toHaveBeenCalledTimes(3)
  })

  it('still completes the send when a listener fails', async () => {
    const { listener, run } = setup()
    listener.mockRejectedValueOnce(new Error('database down'))
    await expect(run(job(payload))).resolves.toBeUndefined()
  })
})
