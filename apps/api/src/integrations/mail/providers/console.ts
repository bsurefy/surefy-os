// SPDX-License-Identifier: AGPL-3.0-only
import type { MailMessage, MailProvider } from '../mail.types.js'
import type { Logger } from '@/core/logger/index.js'

/**
 * Development driver (`MAIL_DRIVER=console`): writes the email to the log instead of sending it,
 * so verification and invitation links can be followed locally. Never selected in production.
 */
export class ConsoleMailProvider implements MailProvider {
  readonly driver = 'console' as const

  constructor(private readonly options: { from: string; logger: Logger }) {}

  send(message: MailMessage): Promise<void> {
    this.options.logger.info(
      { mail: { from: this.options.from, ...message, html: undefined } },
      'email (console driver, not sent)',
    )
    return Promise.resolve()
  }

  close(): Promise<void> {
    return Promise.resolve()
  }
}
