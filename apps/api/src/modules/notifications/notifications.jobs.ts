// SPDX-License-Identifier: AGPL-3.0-only
import { UnrecoverableError, type Job } from 'bullmq'

import { QUEUES } from '@/constants/queues.js'
import { defineJob, type JobDefinition } from '@/core/queue/index.js'
import { MailRejectedError } from '@/integrations/mail/index.js'

import { SEND_EMAIL_JOB_NAME } from './notifications.constants.js'
import { sendEmailPayloadSchema, type SendEmailPayload } from './notifications.schema.js'

import type { NotificationEmailsService } from './notificationEmails/notificationEmails.service.js'
import type { EmailDeliveryListener } from './notifications.types.js'
import type { Logger } from '@/core/logger/index.js'

export type SendEmailJob = JobDefinition<SendEmailPayload>

/** The last attempt BullMQ makes for this job (`attempts` defaults to one). */
const isLastAttempt = (job: Job<unknown>): boolean =>
  job.attemptsMade + 1 >= (job.opts.attempts ?? 1)

/** Tells the listeners how a send ended; a listener's failure never fails the send. */
const report = async (
  listeners: readonly EmailDeliveryListener[],
  payload: SendEmailPayload,
  status: 'sent' | 'failed',
  logger: Logger,
): Promise<void> => {
  for (const listener of listeners) {
    try {
      await listener({ payload, status })
    } catch (error) {
      logger.warn(
        { err: error, template: payload.template, status },
        'email delivery listener failed',
      )
    }
  }
}

/**
 * `email` / `sendEmail`: renders and sends one email. Default retries with backoff for an
 * unreachable server; a permanent refusal is not retried. Built by the module factory, because
 * the processor needs the container's mail provider. Delivery listeners hear `sent` after a
 * send and `failed` after a refusal or the last failed attempt (invitations show "Not delivered").
 */
export const createSendEmailJob = (
  emails: NotificationEmailsService,
  listeners: readonly EmailDeliveryListener[] = [],
): SendEmailJob =>
  defineJob({
    queue: QUEUES.EMAIL,
    name: SEND_EMAIL_JOB_NAME,
    schema: sendEmailPayloadSchema,
    process: (runtime) => async (payload, job) => {
      try {
        await emails.deliver(payload)
      } catch (error) {
        const rejected = error instanceof MailRejectedError
        if (rejected || isLastAttempt(job)) {
          await report(listeners, payload, 'failed', runtime.logger)
        }
        if (rejected) {
          throw new UnrecoverableError(`email ${payload.template} rejected: ${error.message}`)
        }
        throw error
      }
      await report(listeners, payload, 'sent', runtime.logger)
    },
  })
