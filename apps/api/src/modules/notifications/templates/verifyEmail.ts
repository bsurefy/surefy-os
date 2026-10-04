// SPDX-License-Identifier: AGPL-3.0-only
import type { Locale } from '@surefy/contracts'

import type { EmailCopy } from './layout.js'

export interface VerifyEmailParams {
  appName: string
  url: string
}

/** Sent by sign-up and by an email change; the link confirms the address. */
export const verifyEmailCopy: Record<Locale, (params: VerifyEmailParams) => EmailCopy> = {
  en: ({ appName, url }) => ({
    subject: 'Verify your email address',
    heading: 'Verify your email address',
    intro: [
      `Confirm that this is your email address to finish setting up your ${appName} account.`,
    ],
    action: { label: 'Verify email', url },
    footnote: "If you didn't create an account, you can ignore this email.",
  }),
}
