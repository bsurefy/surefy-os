// SPDX-License-Identifier: AGPL-3.0-only
import { expect, request as playwrightRequest, test } from '@playwright/test'

import type { ApiKeyCreatedDto } from '@surefy/contracts'

import { callApi, currentOrgId } from './support/api'
import { apiUrl, mcpServerUrl, ORGANIZATION, OWNER_STATE, STUB_MODEL_ID } from './support/env'
import { connectStubModel, removeStubModel } from './support/models'
import { refreshOwnerSession } from './support/session'
import { startWorker, stopWorker } from './support/worker'

import type { Page } from '@playwright/test'
import type { ChildProcess } from 'node:child_process'

const AGENTS = `/${ORGANIZATION.slug}/agents`
const stamp = String(Date.now())
const NAME = `Order desk ${stamp}`
const SERVER_NAME = 'Orders MCP'
const INSTRUCTIONS = 'You answer questions about orders. Look an order up before you answer.'

let worker: ChildProcess
let orgId = ''
let agentId = ''
let secret = ''
let staleId = ''
let connectionName = ''

test.beforeAll(async ({ browser }) => {
  // creating an API key needs a recent sign-in, and this spec runs late in the run
  await refreshOwnerSession(browser)
  // a run executes in the worker
  worker = await startWorker()
})
test.afterAll(async ({ browser }) => {
  stopWorker(worker)
  const context = await browser.newContext({ storageState: OWNER_STATE })
  try {
    const page = await context.newPage()
    await page.goto(`/${ORGANIZATION.slug}/chat`)
    if (agentId !== '') {
      const confirm = `confirmName=${encodeURIComponent(NAME)}&reason=cleanup`
      await callApi(page, 'DELETE', `/orgs/${orgId}/agents/${agentId}?${confirm}`)
    }
    await removeStubModel(page)
  } finally {
    await context.close()
  }
})

interface Draft {
  revision: number
  definition: {
    instructions: string
    model: { modelKey: string }
    tools: {
      name: string
      kind: string
      permission: string
      connectionId?: string | null
      discoveredActions?: unknown[]
    }[]
  }
}

/** The draft as the server holds it: autosave is quiet, so a spec waits for this, not for a toast. */
const serverDraft = (page: Page) =>
  callApi<Draft>(page, 'GET', `/orgs/${orgId}/agents/${agentId}/draft`)

/** The actions the stub MCP server has been called with so far. */
async function mcpCalls() {
  const response = await playwrightRequest.newContext()
  try {
    return (await (await response.get(`${mcpServerUrl}/control/calls`)).json()) as unknown[]
  } finally {
    await response.dispose()
  }
}

/** A call to the organization's public API with a key (or none), at the API's own address. */
async function callRunApi(
  key: string | null,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
) {
  const api = await playwrightRequest.newContext()
  try {
    const response = await api.fetch(`${apiUrl}/api/v1/orgs/${orgId}${path}`, {
      method,
      headers: key === null ? {} : { authorization: `Bearer ${key}` },
      ...(body === undefined ? {} : { data: body }),
    })
    const text = await response.text()
    return { status: response.status(), body: text === '' ? null : (JSON.parse(text) as unknown) }
  } finally {
    await api.dispose()
  }
}

const agentStatus = async (page: Page) =>
  (await callApi<{ status: string }>(page, 'GET', `/orgs/${orgId}/agents/${agentId}`)).status

/** Opens the agent's row menu in the list and picks an action. */
async function openRowMenu(page: Page, action: string) {
  await page.getByRole('button', { name: `Actions for ${NAME}` }).click()
  await page.getByRole('menuitem', { name: action }).click()
}

const tab = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Agent sections' }).getByRole('link', { name })

// One agent is built, tested, published and used across the specs, in order.
test.describe.configure({ mode: 'serial' })

test.describe('Agents on the real API', () => {
  test('starts empty and offers the templates', async ({ page }) => {
    await page.goto(AGENTS)
    orgId = await currentOrgId(page)
    await connectStubModel(page)
    await page.reload()
    await expect(page.getByText('Create your first agent')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Browse templates' }).first()).toBeVisible()
  })

  test('starts a blank agent from the templates page', async ({ page }) => {
    await page.goto(`${AGENTS}/new`)
    await expect(page.getByRole('heading', { name: 'Start from scratch' })).toBeVisible()
    await page.getByRole('button', { name: 'Start from scratch' }).click()
    await expect(page).toHaveURL(new RegExp(`${AGENTS}/[0-9a-f-]{36}`))
    agentId = /agents\/([0-9a-f-]{36})/.exec(page.url())?.[1] ?? ''
    await expect(page.getByText('Not published yet')).toBeVisible()
    await expect(tab(page, 'Instructions')).toBeVisible()
  })

  test('autosaves the name and the instructions, and keeps them after a reload', async ({
    page,
  }) => {
    await page.goto(`${AGENTS}/${agentId}`)
    await page.getByRole('textbox', { name: 'Name' }).fill(NAME)
    await page.getByRole('textbox', { name: 'Instructions', exact: true }).fill(INSTRUCTIONS)
    await expect
      .poll(async () => (await serverDraft(page)).definition.instructions)
      .toBe(INSTRUCTIONS)
    await expect
      .poll(
        async () =>
          (await callApi<{ name: string }>(page, 'GET', `/orgs/${orgId}/agents/${agentId}`)).name,
      )
      .toBe(NAME)

    await page.reload()
    await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue(NAME)
    await expect(page.getByRole('textbox', { name: 'Instructions', exact: true })).toHaveValue(
      INSTRUCTIONS,
    )
  })

  test('chooses the model from the ones the Vault allows', async ({ page }) => {
    await page.goto(`${AGENTS}/${agentId}/model`)
    await page.getByRole('combobox', { name: 'Model', exact: true }).click()
    await page.getByRole('option', { name: new RegExp(STUB_MODEL_ID) }).click()
    await expect
      .poll(async () => (await serverDraft(page)).definition.model.modelKey)
      .toContain(STUB_MODEL_ID)
    await expect(page.getByRole('combobox', { name: 'Model', exact: true })).toContainText(
      STUB_MODEL_ID,
    )
  })

  test('adds an MCP server, finds its actions and keeps them read only', async ({ page }) => {
    await page.goto(`${AGENTS}/${agentId}/tools`)
    await expect(page.getByText('No tools yet')).toBeVisible()
    await page.getByRole('button', { name: 'Add tool' }).first().click()
    await page.getByRole('menuitem', { name: 'MCP server' }).click()

    const dialog = page.getByRole('dialog', { name: 'Add an MCP server' })
    await dialog.getByRole('textbox', { name: 'Name' }).fill(SERVER_NAME)
    await dialog.getByRole('textbox', { name: 'Server address' }).fill(`${mcpServerUrl}/mcp`)
    await dialog.getByRole('button', { name: 'Find actions' }).click()
    await expect(dialog.getByText('lookup_order')).toBeVisible()
    await expect(dialog.getByText('cancel_order')).toBeVisible()
    await dialog.getByRole('button', { name: 'Save server' }).click()

    const row = page.getByRole('listitem').filter({ hasText: SERVER_NAME })
    await expect(row).toContainText('2 of 2 actions on')
    await expect(row).toContainText('Read only')
    await expect
      .poll(async () => (await serverDraft(page)).definition.tools.map((tool) => tool.kind))
      .toEqual(['mcp'])
  })

  test('tests the draft: the agent calls the MCP server and answers from what it returned', async ({
    page,
  }) => {
    await page.goto(`${AGENTS}/${agentId}/test`)
    await page.getByRole('textbox', { name: 'Message to the agent' }).fill('Look up order 1182')
    await page.getByRole('button', { name: 'Send', exact: true }).click()

    await expect(page.getByText('Tool result: Order 1182 shipped to Lisbon')).toBeVisible()
    await expect(page.getByText('Done', { exact: true }).first()).toBeVisible()
    expect(await mcpCalls()).toEqual([{ name: 'lookup_order', arguments: { orderId: '1182' } }])
  })

  test('keeps test runs out of Runs until asked for, then shows it as a test', async ({ page }) => {
    await page.goto(`${AGENTS}/${agentId}/runs`)
    await expect(page.getByText('No runs yet')).toBeVisible()
    await page.getByRole('switch', { name: 'Test runs' }).click()
    const table = page.getByRole('table', { name: 'Runs of this agent' })
    await expect(table.getByRole('row').nth(1)).toContainText('Test run')
    await expect(table.getByRole('row').nth(1)).toContainText('Done')
  })

  test('will not publish while the MCP server has no account to connect with', async ({ page }) => {
    await page.goto(`${AGENTS}/${agentId}/publish`)
    await expect(page.getByText(`${SERVER_NAME} isn't connected.`)).toBeVisible()
    await expect(page.getByText('Fix 1 item above before publishing.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Publish v1' })).toBeDisabled()
  })

  test('connects the server with an account that needs no sign-in', async ({ page }) => {
    await page.goto(`${AGENTS}/${agentId}/tools`)
    connectionName = `Orders MCP open ${stamp}`
    await callApi(page, 'POST', `/orgs/${orgId}/connections`, {
      providerKey: 'mcp',
      authType: 'none',
      scope: 'organization',
      name: connectionName,
      baseUrl: `${mcpServerUrl}/mcp`,
    })
    await page.reload()
    await page.getByRole('button', { name: `Edit ${SERVER_NAME}` }).click()
    const dialog = page.getByRole('dialog', { name: 'Edit MCP server' })
    await dialog.getByRole('combobox', { name: 'Account' }).click()
    await page.getByRole('option', { name: new RegExp(connectionName) }).click()
    await dialog.getByRole('button', { name: 'Save server' }).click()
    await expect(page.getByText(`Connection: ${connectionName}`)).toBeVisible()
    await expect
      .poll(async () => (await serverDraft(page)).definition.tools[0]?.connectionId)
      .not.toBeNull()
  })

  test('checks readiness, turns the API on and publishes version 1', async ({ page }) => {
    await page.goto(`${AGENTS}/${agentId}/publish`)
    await expect(page.getByText('Ready to publish.')).toBeVisible()
    await expect(page.getByText('This is the first version of the agent.')).toBeVisible()
    await page.getByRole('switch', { name: 'Turn on the API' }).click()
    await page.getByRole('textbox', { name: 'Notes for this version' }).fill('First release')
    await page.getByRole('button', { name: 'Publish v1' }).click()

    await expect(page.getByText('Version 1 is live').first()).toBeVisible()
    const channels = page.getByRole('region', { name: 'Channels' })
    await expect(channels).toContainText('SurefyOS chat')
    await expect(channels).toContainText('Live')
  })

  test('lists the agent for the people it is published to, for Chat', async ({ page }) => {
    await page.goto(AGENTS)
    const usable = await callApi<{ id: string; name: string }[]>(
      page,
      'GET',
      `/orgs/${orgId}/agents/usable`,
    )
    expect(usable.map((agent) => agent.id)).toContain(agentId)
    await expect(page.getByText(NAME).first()).toBeVisible()
    await expect(page.getByText('Active').first()).toBeVisible()
  })

  test('runs the live version over the API with a key, and only with one that may', async ({
    page,
  }) => {
    await page.goto(AGENTS)
    const key = await callApi<ApiKeyCreatedDto>(page, 'POST', `/orgs/${orgId}/api-keys`, {
      name: `Order desk key ${stamp}`,
      scopes: ['agents:invoke'],
    })
    secret = key.secret
    const calls = (await mcpCalls()).length

    const started = await callRunApi(secret, 'POST', `/agents/${agentId}/runs`, {
      input: 'Look up order 2044',
      metadata: { ticket: 'T-77' },
    })
    expect(started.status).toBe(202)
    const run = (started.body as { data: { id: string; metadata: Record<string, string> } }).data
    expect(run.metadata).toEqual({ ticket: 'T-77' })

    await expect
      .poll(async () => {
        const read = await callRunApi(secret, 'GET', `/runs/${run.id}`)
        return (read.body as { data: { status: string } }).data.status
      })
      .toBe('succeeded')
    const finished = await callRunApi(secret, 'GET', `/runs/${run.id}`)
    expect((finished.body as { data: { output: { text: string } } }).data.output.text).toBe(
      'Tool result: Order 2044 shipped to Lisbon',
    )
    expect(await mcpCalls()).toHaveLength(calls + 1)

    // no key is refused (the sign-in layer answers a bare POST), and so is a made-up key
    const bare = await callRunApi(null, 'POST', `/agents/${agentId}/runs`, { input: 'Hi' })
    expect([401, 403]).toContain(bare.status)
    const made = await callRunApi(`sk_${'0'.repeat(48)}`, 'POST', `/agents/${agentId}/runs`, {
      input: 'Hi',
    })
    expect(made.status).toBe(401)
    const reader = await callApi<ApiKeyCreatedDto>(page, 'POST', `/orgs/${orgId}/api-keys`, {
      name: `Reader ${stamp}`,
      scopes: ['access:read-self'],
    })
    const refused = await callRunApi(reader.secret, 'POST', `/agents/${agentId}/runs`, {
      input: 'Hi',
    })
    expect(refused.status).toBe(403)
    await callApi(page, 'POST', `/orgs/${orgId}/api-keys/${reader.apiKey.id}/revoke`)
  })

  test('shows the run over the API in Runs, started through the API', async ({ page }) => {
    await page.goto(`${AGENTS}/${agentId}/runs`)
    const row = page.getByRole('table', { name: 'Runs of this agent' }).getByRole('row').nth(1)
    await expect(row).toContainText('API')
    await expect(row).toContainText('Done')
    await expect(row).toContainText('v1')
  })

  test('publishes a second version and rolls back to the first', async ({ page }) => {
    await page.goto(`${AGENTS}/${agentId}`)
    await page
      .getByRole('textbox', { name: 'Instructions', exact: true })
      .fill(`${INSTRUCTIONS} Keep answers short.`)
    await expect
      .poll(async () => (await serverDraft(page)).definition.instructions)
      .toContain('Keep answers short.')

    await page.goto(`${AGENTS}/${agentId}/publish`)
    await expect(page.getByText('Changes since version 1')).toBeVisible()
    await page.getByRole('button', { name: 'Publish v2' }).click()
    await expect(page.getByText('Version 2 is live').first()).toBeVisible()

    await page.goto(`${AGENTS}/${agentId}/versions`)
    await expect(page.getByText('Version 2').first()).toBeVisible()
    await page.getByRole('button', { name: 'Roll back to version 1' }).click()
    await page.getByRole('button', { name: 'Roll back to v1' }).click()
    await expect(page.getByText('Version 1 is live').first()).toBeVisible()
    // the draft keeps its change
    expect((await serverDraft(page)).definition.instructions).toContain('Keep answers short.')
  })

  test('a paused agent answers no new run over the API, and answers again once resumed', async ({
    page,
  }) => {
    await page.goto(AGENTS)
    await openRowMenu(page, 'Pause')
    await page
      .getByRole('alertdialog', { name: `Pause ${NAME}?` })
      .getByRole('button', { name: 'Pause agent' })
      .click()
    await expect.poll(() => agentStatus(page)).toBe('paused')

    const paused = await callRunApi(secret, 'POST', `/agents/${agentId}/runs`, { input: 'Hi' })
    expect(paused.status).toBe(409)
    expect((paused.body as { error: { code: string } }).error.code).toBe('AGENT_PAUSED')

    await openRowMenu(page, 'Resume')
    await expect.poll(() => agentStatus(page)).toBe('active')
    const again = await callRunApi(secret, 'POST', `/agents/${agentId}/runs`, {
      input: 'Look up order 3',
    })
    expect(again.status).toBe(202)
  })

  test('deletes the agent with its name and a reason, and the key stops reaching it', async ({
    page,
  }) => {
    await page.goto(AGENTS)
    await openRowMenu(page, 'Delete…')
    const dialog = page.getByRole('alertdialog', { name: `Delete ${NAME}?` })
    await dialog.getByRole('textbox', { name: `Type ${NAME} to confirm` }).fill(NAME)
    await dialog.getByRole('textbox', { name: 'Reason' }).fill('Replaced by the new order desk')
    await dialog.getByRole('button', { name: 'Delete agent' }).click()
    await expect(page.getByText('Create your first agent')).toBeVisible()
    staleId = agentId
    agentId = ''

    expect(
      (await callRunApi(secret, 'POST', `/agents/${staleId}/runs`, { input: 'Hi' })).status,
    ).toBe(404)
  })
})
