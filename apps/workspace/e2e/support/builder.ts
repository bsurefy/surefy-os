// SPDX-License-Identifier: AGPL-3.0-only
import { execFileSync } from 'node:child_process'

import { request } from '@playwright/test'

import { callApi, currentOrgId } from './api'
import { apiUrl, e2e, REPO_ROOT, webUrl } from './env'

import type { Browser, BrowserContext, Page } from '@playwright/test'

const compose = ['compose', '-f', `${REPO_ROOT}infra/docker/compose.dev.yml`]
const run = (command: string, args: string[]) => {
  execFileSync(command, args, { cwd: REPO_ROOT, stdio: 'ignore' })
}
const PASSWORD = 'E2e-builder-password-1'

/** The person a spec signs in as: a Builder of the organization, with a session of their own. */
export interface Builder {
  email: string
  name: string
  context: BrowserContext
  page: Page
}

/**
 * Marks an address verified, as the link in the verification email would. The run sends mail to
 * the console, which a spec cannot read, so the one thing the link does is done in the database.
 */
function verifyEmail(email: string): void {
  run('docker', [
    ...compose,
    'exec',
    '-T',
    'postgres',
    'psql',
    '-v',
    'ON_ERROR_STOP=1',
    '-U',
    'postgres',
    '-d',
    e2e.database,
    '-c',
    `update users set email_verified = true where email = '${email}'`,
  ])
}

/**
 * Adds a Builder to the organization the way a person joins: the Owner invites them, they sign up
 * with the invited address, and accept with the invitation link. Returns a signed-in browser
 * context for them. The caller closes it.
 */
export async function addBuilder(
  browser: Browser,
  owner: Page,
  person: { name: string; email: string },
): Promise<Builder> {
  const orgId = await currentOrgId(owner)
  const invitation = await callApi<{ id: string }>(owner, 'POST', `/orgs/${orgId}/invitations`, {
    email: person.email,
    role: 'builder',
  })
  const link = await callApi<{ url: string }>(
    owner,
    'POST',
    `/orgs/${orgId}/invitations/${invitation.id}/link`,
  )
  const token = /[A-Za-z0-9]{43}/.exec(link.url)?.[0]
  if (token === undefined) throw new Error(`No invitation token in ${link.url}`)

  const api = await request.newContext({
    baseURL: apiUrl,
    extraHTTPHeaders: { origin: webUrl },
  })
  try {
    const signUp = await api.post('/api/auth/sign-up/email', {
      data: { name: person.name, email: person.email, password: PASSWORD },
    })
    if (!signUp.ok()) throw new Error(`Sign-up failed: ${String(signUp.status())}`)
    verifyEmail(person.email)
    const signIn = await api.post('/api/auth/sign-in/email', {
      data: { email: person.email, password: PASSWORD },
    })
    if (!signIn.ok()) throw new Error(`Sign-in failed: ${String(signIn.status())}`)
    const accept = await api.post(`/api/v1/invitations/${token}/accept`)
    if (!accept.ok()) throw new Error(`Accepting the invitation failed: ${await accept.text()}`)
    const state = await api.storageState()
    const context = await browser.newContext({
      storageState: state,
      permissions: ['clipboard-read', 'clipboard-write'],
    })
    const page = await context.newPage()
    return { ...person, context, page }
  } finally {
    await api.dispose()
  }
}
