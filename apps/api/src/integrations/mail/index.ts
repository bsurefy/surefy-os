// SPDX-License-Identifier: AGPL-3.0-only
import { ConsoleMailProvider } from './providers/console.js'
import { SmtpMailProvider } from './providers/smtp.js'

import type { MailProvider } from './mail.types.js'
import type { Config } from '@/core/config/index.js'
import type { Logger } from '@/core/logger/index.js'

export { MailError, MailRejectedError, MailUnavailableError } from './mail.errors.js'
export type { MailMessage, MailProvider } from './mail.types.js'
export { ConsoleMailProvider } from './providers/console.js'
export { SmtpMailProvider, type SmtpMailOptions, type SmtpTransport } from './providers/smtp.js'

/** The mail provider selected by `MAIL_DRIVER`. Nothing connects until the first email. */
export function createMail(config: Config, logger: Logger): MailProvider {
  const { mail } = config
  logger.info({ driver: mail.driver }, 'mail provider selected')
  if (mail.driver === 'console') return new ConsoleMailProvider({ from: mail.from, logger })
  return new SmtpMailProvider({ from: mail.from, smtp: mail.smtp })
}
