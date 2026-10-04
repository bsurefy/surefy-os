// SPDX-License-Identifier: AGPL-3.0-only
import type { Locale } from '@surefy/contracts'

import type { EmailCopy } from './layout.js'

export interface InvitationParams {
  appName: string
  url: string
  organizationName: string
  inviterName: string | null
}

/** Sent when a member invites someone by email; the link opens the invitation. */
export const invitationCopy: Record<Locale, (params: InvitationParams) => EmailCopy> = {
  en: ({ appName, url, organizationName, inviterName }) => ({
    subject:
      inviterName === null
        ? `You're invited to join ${organizationName} on ${appName}`
        : `${inviterName} invited you to join ${organizationName} on ${appName}`,
    heading: `Join ${organizationName}`,
    intro: [
      inviterName === null
        ? `You've been invited to join ${organizationName} on ${appName}.`
        : `${inviterName} invited you to join ${organizationName} on ${appName}.`,
    ],
    action: { label: 'Accept invitation', url },
    footnote: "If you weren't expecting this invitation, you can ignore this email.",
  }),
}
