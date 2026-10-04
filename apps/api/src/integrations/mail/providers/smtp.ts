// SPDX-License-Identifier: AGPL-3.0-only
import { createTransport } from 'nodemailer'

import { MailRejectedError, MailUnavailableError } from '../mail.errors.js'

import type { MailMessage, MailProvider } from '../mail.types.js'
import type { SmtpConfig } from '@/core/config/index.js'

/** The part of a Nodemailer transporter the provider uses (a fake in tests). */
export interface SmtpTransport {
  sendMail(mail: {
    from: string
    to: string
    subject: string
    html: string
    text: string
    replyTo?: string
  }): Promise<unknown>
  close(): void
}

export interface SmtpMailOptions {
  from: string
  smtp: SmtpConfig
  /** Replaces the Nodemailer transport (tests). */
  transport?: SmtpTransport
}

const responseCodeOf = (error: unknown): number | undefined =>
  typeof error === 'object' &&
  error !== null &&
  'responseCode' in error &&
  typeof error.responseCode === 'number'
    ? error.responseCode
    : undefined

/** Any SMTP server through Nodemailer (implicit TLS on `secure`, STARTTLS otherwise). */
export class SmtpMailProvider implements MailProvider {
  readonly driver = 'smtp' as const
  private readonly transport: SmtpTransport

  constructor(private readonly options: SmtpMailOptions) {
    const { smtp } = options
    this.transport =
      options.transport ??
      createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        ...(smtp.user === undefined
          ? {}
          : { auth: { user: smtp.user, pass: smtp.password ?? '' } }),
      })
  }

  async send(message: MailMessage): Promise<void> {
    try {
      await this.transport.sendMail({
        from: this.options.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(message.replyTo === undefined ? {} : { replyTo: message.replyTo }),
      })
    } catch (error) {
      const responseCode = responseCodeOf(error)
      // 5xx is a permanent refusal; 4xx, connection and timeout errors are worth a retry.
      if (responseCode !== undefined && responseCode >= 500) {
        throw new MailRejectedError(responseCode, { cause: error })
      }
      throw new MailUnavailableError({ cause: error })
    }
  }

  close(): Promise<void> {
    this.transport.close()
    return Promise.resolve()
  }
}
