// SPDX-License-Identifier: AGPL-3.0-only
import { SOURCE_LOCALE } from '../notifications.constants.js'
import { invitationCopy } from './invitation.js'
import { renderLayout, type RenderedEmail } from './layout.js'
import { passwordResetCopy } from './passwordReset.js'
import { verifyEmailCopy } from './verifyEmail.js'

import type { SendEmailPayload } from '../notifications.schema.js'

export { escapeHtml, type EmailCopy, type RenderedEmail } from './layout.js'

/** Renders the payload's template in the recipient's locale (the source locale when absent). */
export function renderEmail(payload: SendEmailPayload, appName: string): RenderedEmail {
  const locale = payload.locale ?? SOURCE_LOCALE
  switch (payload.template) {
    case 'verifyEmail':
      return renderLayout(verifyEmailCopy[locale]({ appName, url: payload.url }), appName, locale)
    case 'passwordReset':
      return renderLayout(passwordResetCopy[locale]({ appName, url: payload.url }), appName, locale)
    case 'invitation':
      return renderLayout(
        invitationCopy[locale]({
          appName,
          url: payload.url,
          organizationName: payload.organizationName,
          inviterName: payload.inviterName,
        }),
        appName,
        locale,
      )
  }
}
