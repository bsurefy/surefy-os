// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { sendEmailPayloadSchema, type SendEmailPayload } from '../notifications.schema.js'
import { escapeHtml, renderEmail } from '../templates/index.js'

const url = 'https://app.example.test/verify?token=abc&next=%2F'
const invitation: SendEmailPayload = {
  template: 'invitation',
  to: 'new@example.test',
  orgId: '0199b2c4-0000-7000-8000-000000000001',
  invitationId: '0199b2c4-0000-7000-8000-000000000002',
  url,
  organizationName: 'Acme <Labs>',
  inviterName: 'Maya "M" Chen',
}

describe('email templates', () => {
  it.each([
    [{ template: 'verifyEmail', to: 'a@example.test', url }, 'Verify your email address'],
    [{ template: 'passwordReset', to: 'a@example.test', url }, 'Reset your password'],
    [invitation, 'Maya "M" Chen invited you to join Acme <Labs> on SurefyOS'],
  ] as const)('renders %s with its link in both parts', (payload, subject) => {
    const email = renderEmail(payload, 'SurefyOS')
    expect(email.subject).toBe(subject)
    expect(email.html).toContain(`href="${escapeHtml(url)}"`)
    expect(email.html).toContain('<html lang="en">')
    expect(email.text).toContain(url)
  })

  it('escapes names in the HTML and keeps them plain in the text part', () => {
    const email = renderEmail(invitation, 'SurefyOS')
    expect(email.html).toContain('Acme &lt;Labs&gt;')
    expect(email.html).toContain('Maya &quot;M&quot; Chen')
    expect(email.html).not.toContain('<Labs>')
    expect(email.text).toContain('Maya "M" Chen invited you to join Acme <Labs> on SurefyOS.')
  })

  it('words an invitation without an inviter', () => {
    const email = renderEmail({ ...invitation, inviterName: null }, 'SurefyOS')
    expect(email.subject).toBe("You're invited to join Acme <Labs> on SurefyOS")
  })

  it('keeps the subject on one line', () => {
    const email = renderEmail(
      { ...invitation, organizationName: 'Acme\r\nBcc: x@example.test' },
      'S',
    )
    expect(email.subject).not.toMatch(/[\r\n]/)
  })
})

describe('sendEmail payload', () => {
  it('accepts http(s) links only', () => {
    const base = { template: 'verifyEmail', to: 'a@example.test' }
    expect(sendEmailPayloadSchema.safeParse({ ...base, url }).success).toBe(true)
    for (const bad of ['javascript:alert(1)', 'mailto:a@example.test', 'not a url']) {
      expect(sendEmailPayloadSchema.safeParse({ ...base, url: bad }).success).toBe(false)
    }
  })

  it('rejects an unknown template or a missing recipient', () => {
    expect(
      sendEmailPayloadSchema.safeParse({ template: 'welcome', to: 'a@example.test', url }).success,
    ).toBe(false)
    expect(sendEmailPayloadSchema.safeParse({ template: 'verifyEmail', url }).success).toBe(false)
  })
})
