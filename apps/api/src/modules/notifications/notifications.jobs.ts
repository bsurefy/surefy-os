// SPDX-License-Identifier: AGPL-3.0-only
import { UnrecoverableError } from 'bullmq'

import { QUEUES } from '@/constants/queues.js'
import { defineJob, type JobDefinition } from '@/core/queue/index.js'
import { MailRejectedError } from '@/integrations/mail/index.js'

import { SEND_EMAIL_JOB_NAME } from './notifications.constants.js'
import { sendEmailPayloadSchema, type SendEmailPayload } from './notifications.schema.js'

import type { NotificationEmailsService } from './notificationEmails/notificationEmails.service.js'

export type SendEmailJob = JobDefinition<SendEmailPayload>

/**
 * `email` / `sendEmail`: renders and sends one email. Default retries with backoff for an
 * unreachable server; a permanent refusal is not retried. Built by the module factory, because
 * the processor needs the container's mail provider.
 */
export const createSendEmailJob = (emails: NotificationEmailsService): SendEmailJob =>
  defineJob({
    queue: QUEUES.EMAIL,
    name: SEND_EMAIL_JOB_NAME,
    schema: sendEmailPayloadSchema,
    process: () => async (payload) => {
      try {
        await emails.deliver(payload)
      } catch (error) {
        if (error instanceof MailRejectedError) {
          throw new UnrecoverableError(`email ${payload.template} rejected: ${error.message}`)
        }
        throw error
      }
    },
  })
