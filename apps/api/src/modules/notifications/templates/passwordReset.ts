// SPDX-License-Identifier: AGPL-3.0-only
import type { Locale } from '@surefy/contracts'

import type { EmailCopy } from './layout.js'

export interface PasswordResetParams {
  appName: string
  url: string
}

/** Sent by "Forgot password"; the link opens the form that sets a new password. */
export const passwordResetCopy: Record<Locale, (params: PasswordResetParams) => EmailCopy> = {
  en: ({ appName, url }) => ({
    subject: 'Reset your password',
    heading: 'Reset your password',
    intro: [`We received a request to reset the password of your ${appName} account.`],
    action: { label: 'Reset password', url },
    footnote:
      "If you didn't ask for this, you can ignore this email. Your password stays the same.",
  }),
}
