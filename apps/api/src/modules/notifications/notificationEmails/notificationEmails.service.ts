// SPDX-License-Identifier: AGPL-3.0-only
import { renderEmail } from '../templates/index.js'

import type { SendEmailPayload } from '../notifications.schema.js'
import type { MailProvider } from '@/integrations/mail/index.js'

interface NotificationEmailsServiceDeps {
  mail: MailProvider
  /** The product name in the copy and the header (`APP_NAME`). */
  appName: string
}

/**
 * Renders and sends one email; runs in the worker only (the `sendEmail` job). Mail errors
 * propagate as the integration's typed errors, so the job decides whether to retry.
 */
export class NotificationEmailsService {
  constructor(private readonly deps: NotificationEmailsServiceDeps) {}

  async deliver(payload: SendEmailPayload): Promise<void> {
    const email = renderEmail(payload, this.deps.appName)
    await this.deps.mail.send({ to: payload.to, ...email })
  }
}
