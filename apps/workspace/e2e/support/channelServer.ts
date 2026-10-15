// SPDX-License-Identifier: AGPL-3.0-only
// A stand-in for Slack and WhatsApp (Meta's Graph API) and for a customer's website, in the
// end-to-end run, started by Playwright next to the API. `CONNECTIONS_PROVIDER_ORIGINS` points
// both apps at this origin, so every address SurefyOS calls keeps its path here: Slack's sign-in
// page (`/oauth/v2/authorize`), token endpoint (`/api/oauth.v2.access`), `auth.test`,
// `auth.revoke` and `chat.postMessage`, and the Graph API's phone number and `messages` calls
// (`/v21.0/...`). The sign-in page sends the browser straight back with a code, as if the person
// allowed access.
// The website is `GET /site`: a page with whatever markup `PUT /control/site` last set (the
// widget's script tag), served from this origin, which the widget channel lists as its website.
// `GET /control/slack/messages` and `GET /control/whatsapp/messages` list what the agent sent;
// `DELETE` on either forgets them; `POST /control/slack/expire` makes the Slack token stop working,
// as an app that was uninstalled does; `POST /control/slack/restore` makes it work again.
import { createServer } from 'node:http'

import { e2e, SLACK_TEAM, SLACK_TEAM_ID, SLACK_BOT_ID, WHATSAPP_NUMBER } from './env'

import type { IncomingMessage, ServerResponse } from 'node:http'

const SLACK_SCOPES = 'app_mentions:read,chat:write,im:history,im:read,im:write'

interface SlackMessage {
  channel: string
  thread: string
  text: string
}

interface WhatsappMessage {
  phoneNumberId: string
  to: string
  text: string
}

const codes = new Set<string>()
const slackTokens = new Set<string>()
const slackMessages: SlackMessage[] = []
const whatsappMessages: WhatsappMessage[] = []
let slackExpired = false
let issued = 0
let site = '<p>Nothing here yet.</p>'

function send(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(body))
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

const tokenOf = (request: IncomingMessage): string | null => {
  const header = request.headers.authorization ?? ''
  return header.startsWith('Bearer ') ? header.slice('Bearer '.length) : null
}

/** Slack answers 200 with `ok: false` and an error code, also for a token it does not know. */
const slackSignedIn = (request: IncomingMessage): boolean =>
  !slackExpired && slackTokens.has(tokenOf(request) ?? '')

function authorize(url: URL, response: ServerResponse) {
  const redirect = url.searchParams.get('redirect_uri')
  if (redirect === null) {
    send(response, 400, { error: 'invalid_request' })
    return
  }
  const code = `slack-code-${String(codes.size + 1)}`
  codes.add(code)
  const back = new URL(redirect)
  back.searchParams.set('code', code)
  back.searchParams.set('state', url.searchParams.get('state') ?? '')
  response.writeHead(302, { location: back.toString() })
  response.end()
}

async function slackToken(request: IncomingMessage, response: ServerResponse) {
  const body = new URLSearchParams(await readBody(request))
  const code = body.get('code') ?? ''
  if (!codes.delete(code)) {
    send(response, 200, { ok: false, error: 'invalid_code' })
    return
  }
  issued += 1
  const token = `xoxb-e2e-${String(issued)}`
  slackTokens.add(token)
  slackExpired = false
  send(response, 200, {
    ok: true,
    access_token: token,
    token_type: 'bot',
    scope: SLACK_SCOPES,
    bot_user_id: SLACK_BOT_ID,
    team: { id: SLACK_TEAM_ID, name: SLACK_TEAM },
  })
}

function slackAuthTest(request: IncomingMessage, response: ServerResponse) {
  if (!slackSignedIn(request)) {
    send(response, 200, { ok: false, error: 'invalid_auth' })
    return
  }
  send(response, 200, {
    ok: true,
    team_id: SLACK_TEAM_ID,
    team: SLACK_TEAM,
    user_id: SLACK_BOT_ID,
  })
}

async function slackPostMessage(request: IncomingMessage, response: ServerResponse) {
  const body = JSON.parse((await readBody(request)) || '{}') as {
    channel?: string
    thread_ts?: string
    text?: string
  }
  if (!slackSignedIn(request)) {
    send(response, 200, { ok: false, error: 'invalid_auth' })
    return
  }
  slackMessages.push({
    channel: body.channel ?? '',
    thread: body.thread_ts ?? '',
    text: body.text ?? '',
  })
  send(response, 200, { ok: true, ts: String(Date.now() / 1000) })
}

/** The Graph API: the business number's details, and sending a text from it. */
async function graph(request: IncomingMessage, url: URL, response: ServerResponse) {
  const [, , phoneNumberId, rest] = url.pathname.split('/')
  if (tokenOf(request) === null) {
    send(response, 401, { error: { code: 190, message: 'Invalid OAuth access token.' } })
    return
  }
  if (request.method === 'GET' && rest === undefined) {
    send(response, 200, {
      id: phoneNumberId,
      display_phone_number: WHATSAPP_NUMBER.display,
      verified_name: WHATSAPP_NUMBER.name,
    })
  } else if (request.method === 'POST' && rest === 'messages') {
    const body = JSON.parse((await readBody(request)) || '{}') as {
      to?: string
      text?: { body?: string }
    }
    whatsappMessages.push({
      phoneNumberId: phoneNumberId ?? '',
      to: body.to ?? '',
      text: body.text?.body ?? '',
    })
    send(response, 200, { messaging_product: 'whatsapp', messages: [{ id: 'wamid.e2e' }] })
  } else {
    send(response, 404, { error: { code: 100, message: 'Unsupported request' } })
  }
}

type Handler = (request: IncomingMessage, url: URL, response: ServerResponse) => unknown

/** Fixed routes by `METHOD /path`; the Graph API is matched after these. */
const ROUTES: Readonly<Record<string, Handler>> = {
  'GET /health/live': (_request, _url, response) => {
    send(response, 200, { ok: true })
  },
  'GET /oauth/v2/authorize': (_request, url, response) => {
    authorize(url, response)
  },
  'POST /api/oauth.v2.access': (request, _url, response) => slackToken(request, response),
  'POST /api/auth.test': (request, _url, response) => {
    slackAuthTest(request, response)
  },
  'POST /api/auth.revoke': (_request, _url, response) => {
    send(response, 200, { ok: true, revoked: true })
  },
  'POST /api/chat.postMessage': (request, _url, response) => slackPostMessage(request, response),
  'GET /site': (_request, _url, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end(
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Acme shop</title></head>` +
        `<body><h1>Acme shop</h1>${site}</body></html>`,
    )
  },
  'PUT /control/site': async (request, _url, response) => {
    site = await readBody(request)
    send(response, 200, { ok: true })
  },
  'GET /control/slack/messages': (_request, _url, response) => {
    send(response, 200, slackMessages)
  },
  'DELETE /control/slack/messages': (_request, _url, response) => {
    slackMessages.length = 0
    send(response, 200, { ok: true })
  },
  'POST /control/slack/expire': (_request, _url, response) => {
    slackExpired = true
    send(response, 200, { ok: true })
  },
  'POST /control/slack/restore': (_request, _url, response) => {
    slackExpired = false
    send(response, 200, { ok: true })
  },
  'GET /control/whatsapp/messages': (_request, _url, response) => {
    send(response, 200, whatsappMessages)
  },
  'DELETE /control/whatsapp/messages': (_request, _url, response) => {
    whatsappMessages.length = 0
    send(response, 200, { ok: true })
  },
}

async function route(request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url ?? '/', 'http://localhost')
  const method = request.method ?? 'GET'
  const fixed = ROUTES[`${method} ${url.pathname}`]
  if (fixed !== undefined) await fixed(request, url, response)
  else if (url.pathname.startsWith('/v21.0/')) await graph(request, url, response)
  else send(response, 404, { error: `No route for ${method} ${url.pathname}` })
}

const server = createServer((request, response) => {
  route(request, response).catch((error: unknown) => {
    send(response, 500, { error: String(error) })
  })
})

server.listen(e2e.channelPort, '127.0.0.1')
