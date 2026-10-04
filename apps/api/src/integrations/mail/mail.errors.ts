// SPDX-License-Identifier: AGPL-3.0-only
// Provider-agnostic errors. Providers map vendor failures to these; the email job decides from
// them whether to retry. Vendor error shapes never leave the provider file.

export class MailError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = new.target.name
  }
}

/** The server refused the message for good (5xx: unknown mailbox, rejected sender); not retried. */
export class MailRejectedError extends MailError {
  constructor(
    readonly responseCode: number | undefined,
    options?: { cause?: unknown },
  ) {
    super(responseCode === undefined ? 'mail rejected' : `mail rejected (${responseCode})`, options)
  }
}

/** The server is unreachable, timed out or answered with a temporary failure; retryable. */
export class MailUnavailableError extends MailError {
  constructor(options?: { cause?: unknown }) {
    super('mail server unavailable', options)
  }
}
