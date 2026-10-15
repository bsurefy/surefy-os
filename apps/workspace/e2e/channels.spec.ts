// SPDX-License-Identifier: AGPL-3.0-only
import { createHmac } from 'node:crypto'

import { expect, request as playwrightRequest, test } from '@playwright/test'

import {
  SLACK_EVENTS_PATH,
  SLACK_SIGNATURE_HEADER,
  SLACK_TIMESTAMP_HEADER,
  WHATSAPP_SIGNATURE_HEADER,
  WHATSAPP_WEBHOOK_PATH,
} from '@surefy/contracts'

import { callApi, currentOrgId } from './support/api'
import { addBuilder } from './support/builder'
import {
  apiUrl,
  channelServerUrl,
  ORGANIZATION,
  OWNER_STATE,
  SLACK_BOT_ID,
  SLACK_SIGNING_SECRET,
  SLACK_TEAM,
  SLACK_TEAM_ID,
  webUrl,
  WHATSAPP_APP_SECRET,
  WHATSAPP_NUMBER,
} from './support/env'
import { connectStubModel, removeStubModel } from './support/models'
import { startWorker, stopWorker } from './support/worker'

import type { Builder } from './support/builder'
import type { Locator, Page } from '@playwright/test'
import type { ChildProcess } from 'node:child_process'

// An agent answers on the website widget, in Slack and on WhatsApp. The widget runs on a page of
// the stub website, Slack and WhatsApp are the stub channel server (`channelServer.ts`) that signs
// in, answers checks and records replies; the spec plays the part of the apps' servers and posts
// the signed events they would deliver. Then a Builder asks for a new channel and an Admin decides.
test.describe.configure({ mode: 'serial' })
// copying the embed code and the addresses writes to the clipboard
test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

const stamp = String(Date.now())
const NAME = `Shop helper ${stamp}`
const BUILDER_NAME = `Dana Builder ${stamp}`
const BUILDER_AGENT = `Builder helper ${stamp}`
const SLACK_CHANNEL = 'C0E2E0001'
const REPLY_TIMEOUT_MS = 60_000
/** A widget channel's token in an embed code: `wt_` and 43 characters. */
const WIDGET_TOKEN = /wt_[\w-]{43}(?![\w-])/
const WHATSAPP_CONNECTION = `Acme WhatsApp ${stamp}`

let worker: ChildProcess
let orgId = ''
let agentId = ''
let builder: Builder | undefined
let builderAgentId = ''
let slackConnection = ''
let whatsappConnection = ''
let embedCode = ''
let slackUrl = ''
let verifyToken = ''
const connections: string[] = []

const publishPath = (id: string) => `/${ORGANIZATION.slug}/agents/${id}/publish`
const channelsOf = (page: Page) => page.getByRole('region', { name: 'Channels' })
/** One channel's card on the Publish tab, found by its name. */
const card = (page: Page, name: string) => channelsOf(page).getByRole('group', { name })

test.beforeAll(async () => {
  // a reply goes out from the worker
  worker = await startWorker()
})

test.afterAll(async ({ browser }) => {
  stopWorker(worker)
  await builder?.context.close()
  const context = await browser.newContext({ storageState: OWNER_STATE })
  try {
    const page = await context.newPage()
    await page.goto(`/${ORGANIZATION.slug}/chat`)
    for (const id of [agentId, builderAgentId]) {
      if (id === '') continue
      const name = id === agentId ? NAME : BUILDER_AGENT
      const confirm = `confirmName=${encodeURIComponent(name)}&reason=cleanup`
      await callApi(page, 'DELETE', `/orgs/${orgId}/agents/${id}?${confirm}`)
    }
    for (const id of connections)
      await callApi(page, 'POST', `/orgs/${orgId}/connections/${id}/revoke`)
    await removeStubModel(page)
  } finally {
    await context.close()
  }
})

interface StubMessage {
  channel?: string
  thread?: string
  to?: string
  text: string
}

async function stub(kind: 'slack' | 'whatsapp'): Promise<StubMessage[]> {
  const response = await fetch(`${channelServerUrl}/control/${kind}/messages`)
  return (await response.json()) as StubMessage[]
}

async function forget(kind: 'slack' | 'whatsapp') {
  await fetch(`${channelServerUrl}/control/${kind}/messages`, { method: 'DELETE' })
}

/** Waits for the agent's reply to reach the stub app, and returns it. */
async function expectReply(kind: 'slack' | 'whatsapp', text: string): Promise<StubMessage> {
  const find = async () => (await stub(kind)).find((message) => message.text.includes(text))
  await expect.poll(find, { timeout: REPLY_TIMEOUT_MS }).toBeDefined()
  const found = await find()
  if (found === undefined) throw new Error(`No ${kind} reply with "${text}"`)
  return found
}

/** What the app's own server posts to the public API: a body, signed. */
async function deliver(
  path: string,
  body: unknown,
  headers: Record<string, string>,
): Promise<{ status: number; text: string }> {
  const api = await playwrightRequest.newContext()
  try {
    const response = await api.post(`${apiUrl}${path}`, {
      data: JSON.stringify(body),
      headers: { 'content-type': 'application/json', ...headers },
    })
    return { status: response.status(), text: await response.text() }
  } finally {
    await api.dispose()
  }
}

/**
 * The embed code as a website would carry it. A real install serves the app and the API on one
 * address (or the API on `api.`), so the code's address answers the widget's calls; this run has
 * them on two ports, so the code is pasted with the API's own address.
 */
const onWebsite = (code: string) => code.replaceAll(webUrl, apiUrl)

const slackSignature = (raw: string, timestamp: string, secret = SLACK_SIGNING_SECRET) => {
  const basestring = `v0:${timestamp}:${raw}`
  return `v0=${createHmac('sha256', secret).update(basestring).digest('hex')}`
}

let eventNumber = 0

async function slackEvent(
  text: string,
  options: { signingSecret?: string; thread?: string } = {},
): Promise<{ status: number; text: string }> {
  eventNumber += 1
  const timestamp = String(Math.floor(Date.now() / 1000))
  const body = {
    type: 'event_callback',
    team_id: SLACK_TEAM_ID,
    event_id: `Ev${stamp}${String(eventNumber)}`,
    authorizations: [{ user_id: SLACK_BOT_ID }],
    event: {
      type: 'app_mention',
      user: 'U0PERSON',
      channel: SLACK_CHANNEL,
      ts: options.thread ?? `${timestamp}.00${String(eventNumber)}`,
      text: `<@${SLACK_BOT_ID}> ${text}`,
    },
  }
  const raw = JSON.stringify(body)
  return deliver(SLACK_EVENTS_PATH, body, {
    [SLACK_TIMESTAMP_HEADER]: timestamp,
    [SLACK_SIGNATURE_HEADER]: slackSignature(raw, timestamp, options.signingSecret),
  })
}

async function whatsappMessage(
  from: string,
  text: string,
  secret = WHATSAPP_APP_SECRET,
): Promise<{ status: number; text: string }> {
  eventNumber += 1
  const body = {
    object: 'whatsapp_business_account',
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: WHATSAPP_NUMBER.id },
              messages: [
                {
                  id: `wamid.${stamp}.${String(eventNumber)}`,
                  from,
                  type: 'text',
                  text: { body: text },
                },
              ],
            },
          },
        ],
      },
    ],
  }
  const raw = JSON.stringify(body)
  return deliver(WHATSAPP_WEBHOOK_PATH, body, {
    [WHATSAPP_SIGNATURE_HEADER]: `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`,
  })
}

/** The text of a labelled value on a channel card (a copyable address or token). */
async function valueOf(card: Locator, label: string): Promise<string> {
  // a Copy button is named after the value it copies, so the label must match exactly
  const field = card.getByLabel(label, { exact: true })
  const value = await field.inputValue().catch(() => null)
  return value ?? (await field.innerText())
}

/** Writes the agent's instructions, which publishing needs, as the Instructions tab saves them. */
async function writeInstructions(page: Page, id: string) {
  const draftPath = `/orgs/${orgId}/agents/${id}/draft`
  const draft = await callApi<{ revision: number; definition: Record<string, unknown> }>(
    page,
    'GET',
    draftPath,
  )
  await callApi(page, 'PUT', draftPath, {
    baseRevision: draft.revision,
    definition: { ...draft.definition, instructions: 'You help shoppers with their orders.' },
  })
}

test.describe('Channels on the real API', () => {
  test('arranges an agent that answers with the stub model', async ({ page }) => {
    await page.goto(`/${ORGANIZATION.slug}/chat`)
    orgId = await currentOrgId(page)
    expect(orgId).not.toBe('')
    const modelKey = await connectStubModel(page)
    const agent = await callApi<{ id: string }>(page, 'POST', `/orgs/${orgId}/agents`, {
      name: NAME,
      modelKey,
    })
    agentId = agent.id
    await writeInstructions(page, agentId)
  })

  test('sets up the website widget for the stub website and publishes it', async ({ page }) => {
    await page.goto(publishPath(agentId))
    await expect(page.getByText('Ready to publish.')).toBeVisible()
    await channelsOf(page).getByRole('button', { name: 'Set up the widget' }).click()
    const dialog = page.getByRole('dialog', { name: 'Set up the website widget' })
    await dialog.getByRole('textbox', { name: 'Websites' }).fill(channelServerUrl)
    await dialog.getByRole('textbox', { name: 'Greeting' }).fill('Hello from the shop!')
    await dialog.getByRole('button', { name: 'Add widget' }).click()
    await expect(card(page, 'Website widget')).toContainText('With the next publish')

    await page.getByRole('button', { name: 'Publish v1' }).click()
    // the embed code is shown once, right after the publish
    const embed = page.getByRole('dialog', { name: 'Your embed code' })
    await expect(embed).toBeVisible()
    await expect(embed).toContainText('Paste it before the closing </body> tag')
    embedCode = await valueOf(embed, 'Embed code')
    // the script comes from the app's own address, which a real install routes to the API
    expect(embedCode).toContain(`${webUrl}/widget/v1/widget.js`)
    expect(embedCode).toMatch(WIDGET_TOKEN)
    await embed.getByRole('button', { name: 'Copy code' }).click()
    await embed.getByRole('button', { name: 'Done' }).click()
    await expect(card(page, 'Website widget')).toContainText('Live')
    await expect(card(page, 'Website widget')).toContainText(`Loads on ${channelServerUrl}`)
  })

  test('the widget on the website opens, greets the visitor and streams the answer', async ({
    page,
  }) => {
    await fetch(`${channelServerUrl}/control/site`, { method: 'PUT', body: onWebsite(embedCode) })
    await page.goto(`${channelServerUrl}/site`)
    await page.getByRole('button', { name: `Open chat with ${NAME}` }).click()
    await expect(page.getByText('Hello from the shop!')).toBeVisible()

    await page.getByRole('textbox', { name: 'Type your message' }).fill('Where is order 1182?')
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(page.getByText('Echo: Where is order 1182?', { exact: true })).toBeVisible({
      timeout: REPLY_TIMEOUT_MS,
    })

    // the conversation stays in the visitor's tab
    await page.reload()
    await page.getByRole('button', { name: `Open chat with ${NAME}` }).click()
    await expect(page.getByText('Echo: Where is order 1182?', { exact: true })).toBeVisible()
  })

  test('the widget stays away from a site that is not on the list', async ({ page }) => {
    // the same page on another host name of the stub: its origin is not an allowed one
    const other = channelServerUrl.replace('127.0.0.1', 'localhost')
    const config = page.waitForResponse((response) =>
      response.url().includes('/api/v1/widget/config'),
    )
    await page.goto(`${other}/site`)
    const refused = await config
    expect(refused.status()).toBe(403)
    expect(await refused.text()).toContain('AGENT_WIDGET_ORIGIN_NOT_ALLOWED')
    await expect(page.getByRole('heading', { name: 'Acme shop' })).toBeVisible()
    await expect(page.getByRole('button', { name: `Open chat with ${NAME}` })).toHaveCount(0)
  })

  test('the widget runs show in Runs as the widget channel', async ({ page }) => {
    await page.goto(`/${ORGANIZATION.slug}/agents/${agentId}/runs`)
    const row = page.getByRole('table', { name: 'Runs of this agent' }).getByRole('row').nth(1)
    await expect(row).toContainText('Website widget')
    await expect(row).toContainText('Done')
  })

  test('a new embed code replaces the old one at once', async ({ page }) => {
    await page.goto(publishPath(agentId))
    await card(page, 'Website widget').getByRole('button', { name: 'New embed code' }).click()
    await page
      .getByRole('alertdialog', { name: 'Get a new embed code?' })
      .getByRole('button', { name: 'Get new code' })
      .click()
    const embed = page.getByRole('dialog', { name: 'Your embed code' })
    const fresh = await valueOf(embed, 'Embed code')
    expect(fresh).not.toBe(embedCode)
    await embed.getByRole('button', { name: 'Copy code' }).click()
    await embed.getByRole('button', { name: 'Done' }).click()

    // the old code's widget no longer loads
    await fetch(`${channelServerUrl}/control/site`, { method: 'PUT', body: onWebsite(embedCode) })
    await page.goto(`${channelServerUrl}/site`)
    await expect(page.getByRole('heading', { name: 'Acme shop' })).toBeVisible()
    await page
      .getByRole('button', { name: `Open chat with ${NAME}` })
      .click({ timeout: 5_000 })
      .catch(() => null)
    await expect(page.getByText('Hello from the shop!')).toHaveCount(0)
    embedCode = fresh
  })

  test('connects Slack through its sign-in', async ({ page }) => {
    await page.goto(`/${ORGANIZATION.slug}/settings/connections`)
    await page.getByRole('button', { name: 'Add connection' }).first().click()
    await page
      .getByRole('dialog', { name: 'Add connection' })
      .getByRole('button', { name: 'Slack' })
      .click()
    const dialog = page.getByRole('dialog', { name: 'Connect Slack' })
    const next = dialog.getByRole('button', { name: 'Next' })
    if (await next.isVisible()) await next.click()
    await dialog.getByRole('radio', { name: /^Organization/ }).click()
    await dialog.getByRole('button', { name: 'Continue with Slack' }).click()

    await page.waitForURL(/\/settings\/connections(\?|$)/, { timeout: 60_000 })
    const row = page.getByRole('table', { name: 'Connections' }).getByRole('row', {
      name: new RegExp(SLACK_TEAM),
    })
    await expect(row).toBeVisible()
    const all = await callApi<{ id: string; providerKey: string }[]>(
      page,
      'GET',
      `/orgs/${orgId}/connections`,
    )
    slackConnection = all.find((connection) => connection.providerKey === 'slack')?.id ?? ''
    expect(slackConnection).not.toBe('')
    connections.push(slackConnection)
  })

  test('sets up Slack on the Publish tab and shows the address for the Slack app', async ({
    page,
  }) => {
    await page.goto(publishPath(agentId))
    await channelsOf(page).getByRole('button', { name: 'Set up Slack' }).click()
    const dialog = page.getByRole('dialog', { name: 'Set up Slack' })
    await dialog.getByRole('combobox', { name: 'Connection' }).click()
    await page.getByRole('option', { name: new RegExp(SLACK_TEAM) }).click()
    await dialog.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(card(page, 'Slack')).toContainText('With the next publish')
    await page.getByRole('button', { name: /^Publish v/ }).click()
    await expect(page.getByText(/Version 2 is live/).first()).toBeVisible()
    await expect(card(page, 'Slack')).toContainText('Live')
    await expect(card(page, 'Slack')).toContainText(`Answers through ${SLACK_TEAM}`)

    // the address Slack's Event Subscriptions asks for
    slackUrl = await valueOf(card(page, 'Slack'), 'Request URL')
    expect(slackUrl).toBe(`${apiUrl}${SLACK_EVENTS_PATH}`)
  })

  test('Slack: the set-up check, a refused signature and a mention that is answered', async () => {
    await forget('slack')
    const challenge = await deliver(
      SLACK_EVENTS_PATH,
      { type: 'url_verification', challenge: 'abc123' },
      {
        [SLACK_TIMESTAMP_HEADER]: String(Math.floor(Date.now() / 1000)),
        [SLACK_SIGNATURE_HEADER]: slackSignature(
          JSON.stringify({ type: 'url_verification', challenge: 'abc123' }),
          String(Math.floor(Date.now() / 1000)),
        ),
      },
    )
    expect(challenge.status).toBe(200)
    expect(challenge.text).toContain('abc123')

    const forged = await slackEvent('Where is order 7?', { signingSecret: 'not-the-secret' })
    expect(forged.status).toBe(401)
    expect(forged.text).toContain('AGENT_CHANNEL_SIGNATURE_INVALID')
    expect(await stub('slack')).toEqual([])

    const accepted = await slackEvent('Where is order 7?')
    expect(accepted.status).toBe(200)
    const reply = await expectReply('slack', 'Echo: Where is order 7?')
    expect(reply.channel).toBe(SLACK_CHANNEL)
    expect(reply.thread).toMatch(/^\d+\.\d+$/)
  })

  test('Slack: a follow-up in the thread is answered in the same thread', async () => {
    await forget('slack')
    const thread = '1760000000.000900'
    await slackEvent('First question', { thread })
    await expectReply('slack', 'Echo: First question')
    await slackEvent('Second question', { thread })
    const reply = await expectReply('slack', 'Echo: Second question')
    expect(reply.thread).toBe(thread)
  })

  test('Slack: the runs show in Runs, and an uninstalled app stops the channel', async ({
    page,
  }) => {
    await page.goto(`/${ORGANIZATION.slug}/agents/${agentId}/runs`)
    await expect(
      page
        .getByRole('table', { name: 'Runs of this agent' })
        .getByRole('row')
        .filter({
          hasText: 'Slack',
        })
        .first(),
    ).toBeVisible()

    // Slack refuses the token, as it does once the app is removed from the workspace
    await fetch(`${channelServerUrl}/control/slack/expire`, { method: 'POST' })
    await slackEvent('Anyone there?')
    await page.goto(publishPath(agentId))
    await expect(card(page, 'Slack')).toContainText('Stopped answering on Slack', {
      timeout: REPLY_TIMEOUT_MS,
    })
    await expect(card(page, 'Slack').getByRole('link', { name: 'Reconnect' })).toBeVisible()
  })

  test('Slack answers again once the workspace trusts the app, after Try again', async ({
    page,
  }) => {
    await fetch(`${channelServerUrl}/control/slack/restore`, { method: 'POST' })
    await forget('slack')
    await page.goto(publishPath(agentId))
    await card(page, 'Slack').getByRole('button', { name: 'Try again' }).click()
    await expect(card(page, 'Slack')).toContainText('Live')
    await slackEvent('Are you back?')
    await expectReply('slack', 'Echo: Are you back?')
  })

  test('sets up WhatsApp with a new connection and shows the callback address and verify token', async ({
    page,
  }) => {
    await page.goto(publishPath(agentId))
    await channelsOf(page).getByRole('button', { name: 'Set up WhatsApp' }).click()
    const dialog = page.getByRole('dialog', { name: 'Set up WhatsApp' })
    await dialog.getByRole('button', { name: 'Add connection' }).click()
    const connect = page.getByRole('dialog', { name: 'Connect WhatsApp' })
    await connect.getByRole('textbox', { name: /^Name/ }).fill(WHATSAPP_CONNECTION)
    await connect.getByLabel('Token').fill('e2e-whatsapp-token')
    await connect.getByRole('textbox', { name: 'Phone number ID' }).fill(WHATSAPP_NUMBER.id)
    await connect.getByLabel('App secret').fill(WHATSAPP_APP_SECRET)
    await connect.getByRole('textbox', { name: 'Business account ID' }).fill('100200300')
    await connect.getByRole('button', { name: 'Next' }).click()
    await connect.getByRole('radio', { name: /^Organization/ }).click()
    await connect.getByRole('button', { name: 'Connect', exact: true }).click()

    // the new connection is picked in the set-up dialog, which asks for the account and publishes
    await expect(dialog.getByRole('combobox', { name: 'Connection' })).toContainText(
      WHATSAPP_CONNECTION,
    )
    await dialog.getByRole('textbox', { name: 'WhatsApp Business account ID' }).fill('100200300')
    await dialog.getByRole('textbox', { name: 'Welcome message' }).fill('Welcome to Acme!')
    await dialog.getByRole('button', { name: 'Add', exact: true }).click()
    await page.getByRole('button', { name: /^Publish v/ }).click()
    await expect(card(page, 'WhatsApp')).toContainText('Live')
    await expect(card(page, 'WhatsApp')).toContainText(
      `Answers on phone number ID ${WHATSAPP_NUMBER.id}`,
    )

    expect(await valueOf(card(page, 'WhatsApp'), 'Callback URL')).toBe(
      `${apiUrl}${WHATSAPP_WEBHOOK_PATH}`,
    )
    verifyToken = await valueOf(card(page, 'WhatsApp'), 'Verify token')
    expect(verifyToken).toMatch(/^wv_/)

    const all = await callApi<{ id: string; providerKey: string }[]>(
      page,
      'GET',
      `/orgs/${orgId}/connections`,
    )
    whatsappConnection = all.find((connection) => connection.providerKey === 'whatsapp')?.id ?? ''
    expect(whatsappConnection).not.toBe('')
    connections.push(whatsappConnection)
  })

  test('WhatsApp: Meta’s set-up check needs the verify token, a message is answered', async () => {
    const check = (token: string) =>
      fetch(
        `${apiUrl}${WHATSAPP_WEBHOOK_PATH}?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(token)}&hub.challenge=4711`,
      )
    const refused = await check('wv_wrong')
    expect(refused.status).toBe(403)
    const verified = await check(verifyToken)
    expect(verified.status).toBe(200)
    expect(await verified.text()).toBe('4711')

    await forget('whatsapp')
    const forged = await whatsappMessage('4915100000', 'Hello?', 'not-the-secret')
    expect(forged.status).toBe(401)
    expect(await stub('whatsapp')).toEqual([])

    const accepted = await whatsappMessage('4915100000', 'Where is order 9?')
    expect(accepted.status).toBe(200)
    const reply = await expectReply('whatsapp', 'Echo: Where is order 9?')
    expect(reply.to).toBe('4915100000')
  })

  test('a Builder asks for the widget on a new agent and it waits for an admin', async ({
    browser,
    page,
  }) => {
    await page.goto(`/${ORGANIZATION.slug}/chat`)
    builder = await addBuilder(browser, page, {
      name: BUILDER_NAME,
      email: `builder-${stamp}@e2e.test`,
    })
    const modelKey = await connectStubModel(page)
    await builder.page.goto(`/${ORGANIZATION.slug}/chat`)
    const agent = await callApi<{ id: string }>(builder.page, 'POST', `/orgs/${orgId}/agents`, {
      name: BUILDER_AGENT,
      modelKey,
    })
    builderAgentId = agent.id
    await writeInstructions(builder.page, builderAgentId)

    await builder.page.goto(publishPath(builderAgentId))
    await expect(builder.page.getByText('Ready to publish.')).toBeVisible()
    await channelsOf(builder.page).getByRole('button', { name: 'Set up the widget' }).click()
    const dialog = builder.page.getByRole('dialog', { name: 'Set up the website widget' })
    await dialog.getByRole('textbox', { name: 'Websites' }).fill(channelServerUrl)
    await dialog.getByRole('button', { name: 'Add widget' }).click()
    await expect(card(builder.page, 'Website widget')).toContainText(
      'an admin is asked to approve publishing',
    )
    await builder.page.getByRole('button', { name: 'Publish v1' }).click()

    await expect(
      builder.page.getByText(/Waiting for an admin to approve publishing/).first(),
    ).toBeVisible()
    await expect(card(builder.page, 'Website widget')).toContainText('Waiting for an admin')
  })

  test('the admin finds the request in Approvals and approves it', async ({ page }) => {
    await page.goto(`/${ORGANIZATION.slug}/insights/approvals`)
    const rows = page.getByRole('table', { name: 'Approvals' }).getByRole('row')
    const row = rows.filter({ hasText: 'Channel publish request' }).first()
    await expect(row).toBeVisible()
    await expect(row).toContainText(BUILDER_AGENT)
    // a click before the page has hydrated is lost: click again until the request opens
    const detail = /\/insights\/approvals\/[0-9a-f-]{36}$/
    await expect(async () => {
      if (!detail.test(page.url())) await row.click({ timeout: 5_000 })
      await expect(page).toHaveURL(detail, { timeout: 10_000 })
    }).toPass()
    await expect(
      page.getByRole('heading', { name: `Publish ${BUILDER_AGENT} to the website widget` }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Approve', exact: true }).click()
    await expect(page.getByRole('status').getByText('Approved')).toBeVisible()
  })

  test('the Builder’s widget is live and the Builder takes the embed code once', async () => {
    if (builder === undefined) throw new Error('The Builder was not added')
    const { page } = builder
    await page.goto(publishPath(builderAgentId))
    await expect(card(page, 'Website widget')).toContainText('Live')
    await card(page, 'Website widget').getByRole('button', { name: 'Get embed code' }).click()
    const embed = page.getByRole('dialog', { name: 'Your embed code' })
    const code = await valueOf(embed, 'Embed code')
    expect(code).toMatch(WIDGET_TOKEN)
    await embed.getByRole('button', { name: 'Copy code' }).click()
    await embed.getByRole('button', { name: 'Done' }).click()
    // an approved widget's code is issued once; after that only an admin makes a new one
    await expect(
      card(page, 'Website widget').getByRole('button', { name: 'Get embed code' }),
    ).toHaveCount(0)

    await fetch(`${channelServerUrl}/control/site`, { method: 'PUT', body: onWebsite(code) })
    const visitor = await page.context().browser()?.newPage()
    if (visitor === undefined) throw new Error('No browser')
    try {
      await visitor.goto(`${channelServerUrl}/site`)
      await visitor.getByRole('button', { name: `Open chat with ${BUILDER_AGENT}` }).click()
      await visitor.getByRole('textbox', { name: 'Type your message' }).fill('Hi there')
      await visitor.getByRole('button', { name: 'Send', exact: true }).click()
      await expect(visitor.getByText('Echo: Hi there', { exact: true })).toBeVisible({
        timeout: REPLY_TIMEOUT_MS,
      })
    } finally {
      await visitor.close()
    }
  })

  test('turning a channel off stops it answering', async ({ page }) => {
    await page.goto(publishPath(agentId))
    await card(page, 'WhatsApp').getByRole('button', { name: 'Turn off' }).click()
    await page
      .getByRole('alertdialog', { name: 'Turn off WhatsApp?' })
      .getByRole('button', { name: 'Turn off' })
      .click()
    await expect(page.getByText('Turned off WhatsApp')).toBeVisible()

    await forget('whatsapp')
    const ignored = await whatsappMessage('4915100000', 'Still there?')
    // the provider is not asked to retry, and nothing is sent
    expect(ignored.status).toBe(200)
    await new Promise((resolve) => setTimeout(resolve, 3_000))
    expect(await stub('whatsapp')).toEqual([])
  })
})
