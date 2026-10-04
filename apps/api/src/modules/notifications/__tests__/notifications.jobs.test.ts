// SPDX-License-Identifier: AGPL-3.0-only
import { UnrecoverableError, type Job } from 'bullmq'
import { pino } from 'pino'
import { describe, expect, it } from 'vitest'

import { MailRejectedError, MailUnavailableError } from '@/integrations/mail/index.js'

import { RecordingMailProvider } from './notificationsTestKit.js'
import { NotificationEmailsService } from '../notificationEmails/notificationEmails.service.js'
import { createSendEmailJob } from '../notifications.jobs.js'

import type { JobRuntime } from '@/core/queue/index.js'

const runtime = { logger: pino({ level: 'silent' }) } as unknown as JobRuntime
const job = (data: unknown) => ({ id: '1', data, attemptsMade: 0 }) as unknown as Job<unknown>
const payload = {
  template: 'passwordReset',
  to: 'person@example.test',
  url: 'https://app.example.test/reset?token=abc',
}

const setup = () => {
  const mail = new RecordingMailProvider()
  const sendEmailJob = createSendEmailJob(
    new NotificationEmailsService({ mail, appName: 'SurefyOS' }),
  )
  return { mail, sendEmailJob, run: sendEmailJob.bind(runtime) }
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
})
