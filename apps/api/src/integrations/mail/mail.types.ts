// SPDX-License-Identifier: AGPL-3.0-only

/** One rendered email. Templates live in `modules/notifications/templates/`. */
export interface MailMessage {
  to: string
  subject: string
  html: string
  text: string
  replyTo?: string
}

/**
 * What SurefyOS needs from a mail transport (integrations.md, §4). Emails are always sent from
 * the worker, through the `email` queue.
 */
export interface MailProvider {
  readonly driver: 'console' | 'smtp'
  send(message: MailMessage): Promise<void>
  close(): Promise<void>
}
