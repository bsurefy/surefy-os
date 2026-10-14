// SPDX-License-Identifier: AGPL-3.0-only
// A stand-in for Google Drive and Notion in the end-to-end run, started by Playwright next to the
// API. `CONNECTIONS_PROVIDER_ORIGINS` points both apps at this origin, so every address SurefyOS
// calls keeps its path here: Google's sign-in page (`/o/oauth2/v2/auth`), token endpoint
// (`/token`) and Drive API (`/drive/v3/...`), and Notion's sign-in page (`/v1/oauth/authorize`),
// token endpoint (`/v1/oauth/token`) and API (`/v1/...`). A sign-in page sends the browser straight
// back with a code, as if the person allowed access.
// `POST /control/{google-drive|notion}/expire` makes every token of that app stop working, as an
// app that ended a sign-in does; `PUT /control/google-drive/files/:id` adds or changes a Drive file;
// `GET /control/stats` counts the downloads.
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'

import { DRIVE_ACCOUNT, e2e, NOTION_WORKSPACE } from './env'

import type { IncomingMessage, ServerResponse } from 'node:http'

const FOLDER = 'application/vnd.google-apps.folder'
const TOKEN_LIFETIME_SECONDS = 3600

type App = 'google-drive' | 'notion'

interface DriveFile {
  id: string
  name: string
  mimeType: string
  parent: string
  content?: string
}

/** My Drive: a Handbook folder with a subfolder, and a Finance folder the specs leave out. */
const drive = new Map<string, DriveFile>(
  [
    { id: 'f-handbook', name: 'Handbook', mimeType: FOLDER, parent: 'root' },
    { id: 'f-finance', name: 'Finance', mimeType: FOLDER, parent: 'root' },
    { id: 'f-onboarding', name: 'Onboarding', mimeType: FOLDER, parent: 'f-handbook' },
    {
      id: 'd-returns',
      name: 'returns.md',
      mimeType: 'text/markdown',
      parent: 'f-handbook',
      content: '# Returns\n\nCustomers can return items within 30 days of delivery.\n',
    },
    {
      id: 'd-first-week',
      name: 'first-week.txt',
      mimeType: 'text/plain',
      parent: 'f-onboarding',
      content: 'New hires meet their buddy on the first Monday.\n',
    },
    {
      id: 'd-budget',
      name: 'budget.md',
      mimeType: 'text/markdown',
      parent: 'f-finance',
      content: '# Budget\n\nThe travel budget is 1200 euros a year.\n',
    },
  ].map((file) => [file.id, file]),
)

interface NotionPage {
  id: string
  title: string
  parent: string | null
  paragraphs: string[]
  edited: string
}

/** The pages shared with the integration: a wiki page with one child page. */
const notionPages = new Map<string, NotionPage>(
  [
    {
      id: 'p-wiki',
      title: 'Support wiki',
      parent: null,
      paragraphs: ['Support answers chats from 8:00 to 18:00 on weekdays.'],
      edited: '2026-10-01T09:00:00.000Z',
    },
    {
      id: 'p-escalations',
      title: 'Escalations',
      parent: 'p-wiki',
      paragraphs: ['Refunds above 500 euros go to the support lead.'],
      edited: '2026-10-01T09:00:00.000Z',
    },
  ].map((page) => [page.id, page]),
)

const codes = new Map<string, App>()
const accessTokens = new Map<string, App>()
const refreshTokens = new Map<string, App>()
let issued = 0
let downloads = 0

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

/** Whether the request carries a token this stub issued for `app` and has not expired. */
const isSignedIn = (request: IncomingMessage, app: App): boolean =>
  accessTokens.get(tokenOf(request) ?? '') === app

function issue(app: App) {
  issued += 1
  const access = `${app}-access-${String(issued)}`
  const refresh = `${app}-refresh-${String(issued)}`
  accessTokens.set(access, app)
  refreshTokens.set(refresh, app)
  return { access, refresh }
}

/** The sign-in page: it allows access at once and sends the browser back with a code. */
function authorize(url: URL, response: ServerResponse, app: App) {
  const redirect = url.searchParams.get('redirect_uri')
  if (redirect === null) {
    send(response, 400, { error: 'invalid_request' })
    return
  }
  const code = `${app}-code-${String(codes.size + 1)}`
  codes.set(code, app)
  const back = new URL(redirect)
  back.searchParams.set('code', code)
  back.searchParams.set('state', url.searchParams.get('state') ?? '')
  response.writeHead(302, { location: back.toString() })
  response.end()
}

/** Google's token endpoint: a code or a refresh token for new tokens. */
async function googleToken(request: IncomingMessage, response: ServerResponse) {
  const body = new URLSearchParams(await readBody(request))
  const grant = body.get('grant_type')
  const known =
    grant === 'authorization_code'
      ? codes.get(body.get('code') ?? '')
      : refreshTokens.get(body.get('refresh_token') ?? '')
  if (known !== 'google-drive') {
    send(response, 400, { error: 'invalid_grant', error_description: 'Token has been revoked.' })
    return
  }
  codes.delete(body.get('code') ?? '')
  const tokens = issue('google-drive')
  send(response, 200, {
    access_token: tokens.access,
    refresh_token: tokens.refresh,
    expires_in: TOKEN_LIFETIME_SECONDS,
    token_type: 'Bearer',
    scope: 'https://www.googleapis.com/auth/drive.readonly',
  })
}

/** Notion's token endpoint: a code for a token that does not expire. */
async function notionToken(request: IncomingMessage, response: ServerResponse) {
  const body = JSON.parse((await readBody(request)) || '{}') as { code?: string }
  if (codes.get(body.code ?? '') !== 'notion') {
    send(response, 400, { error: 'invalid_grant' })
    return
  }
  codes.delete(body.code ?? '')
  send(response, 200, {
    access_token: issue('notion').access,
    token_type: 'bearer',
    bot_id: 'bot-surefy',
    workspace_id: 'ws-acme',
    workspace_name: NOTION_WORKSPACE,
  })
}

const revision = (file: DriveFile) =>
  createHash('sha256')
    .update(file.content ?? '')
    .digest('hex')

/** `files.list`: the children of `'<id>' in parents`, folders only, or a name search. */
function listDrive(url: URL, response: ServerResponse) {
  const q = url.searchParams.get('q') ?? ''
  const parent = /'([^']+)' in parents/.exec(q)?.[1]
  const name = /name contains '([^']*)'/.exec(q)?.[1]?.toLowerCase()
  const foldersOnly = q.includes(`mimeType = '${FOLDER}'`)
  const files = [...drive.values()]
    .filter((file) => parent === undefined || file.parent === parent)
    .filter((file) => name === undefined || file.name.toLowerCase().includes(name))
    .filter((file) => !foldersOnly || file.mimeType === FOLDER)
    .map((file) => ({
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      ...(file.mimeType === FOLDER
        ? {}
        : { md5Checksum: revision(file), size: String(Buffer.byteLength(file.content ?? '')) }),
    }))
  send(response, 200, { files })
}

function downloadDrive(id: string, response: ServerResponse) {
  const file = drive.get(id)
  if (file?.content === undefined) {
    send(response, 404, { error: { code: 404, message: 'File not found' } })
    return
  }
  downloads += 1
  response.writeHead(200, { 'content-type': file.mimeType })
  response.end(file.content)
}

async function putDriveFile(id: string, request: IncomingMessage, response: ServerResponse) {
  const body = JSON.parse(await readBody(request)) as Omit<DriveFile, 'id'>
  drive.set(id, { ...body, id })
  send(response, 200, { ok: true })
}

const titleProperty = (title: string) => ({
  title: { id: 'title', type: 'title', title: [{ type: 'text', plain_text: title }] },
})

const notionPage = (page: NotionPage) => ({
  object: 'page',
  id: page.id,
  last_edited_time: page.edited,
  archived: false,
  in_trash: false,
  parent: page.parent === null ? { type: 'workspace' } : { type: 'page_id' },
  properties: titleProperty(page.title),
})

/** A page's blocks: its paragraphs, then its child pages. */
function notionChildren(id: string) {
  const page = notionPages.get(id)
  if (page === undefined) return null
  const paragraphs = page.paragraphs.map((text, index) => ({
    object: 'block',
    id: `${id}-paragraph-${String(index)}`,
    type: 'paragraph',
    has_children: false,
    paragraph: { rich_text: [{ type: 'text', plain_text: text }] },
  }))
  const childPages = [...notionPages.values()]
    .filter((child) => child.parent === id)
    .map((child) => ({
      object: 'block',
      id: child.id,
      type: 'child_page',
      has_children: true,
      child_page: { title: child.title },
    }))
  return { object: 'list', results: [...paragraphs, ...childPages], has_more: false }
}

const notFound = (response: ServerResponse) => {
  send(response, 404, { object: 'error', status: 404, code: 'object_not_found' })
}

/** The Drive API under `/drive/v3`, for a signed-in request. */
function driveApi(request: IncomingMessage, url: URL, response: ServerResponse) {
  const path = url.pathname
  const fileId = /^\/drive\/v3\/files\/([^/]+)$/.exec(path)?.[1]
  if (path === '/drive/v3/about') {
    send(response, 200, { user: { emailAddress: DRIVE_ACCOUNT, permissionId: 'perm-maya' } })
  } else if (path === '/drive/v3/drives') {
    send(response, 200, { drives: [] })
  } else if (path === '/drive/v3/files') {
    listDrive(url, response)
  } else if (fileId !== undefined && url.searchParams.get('alt') === 'media') {
    downloadDrive(decodeURIComponent(fileId), response)
  } else {
    send(response, 404, { error: { code: 404, message: `No route for ${request.method ?? ''}` } })
  }
}

/** The Notion API under `/v1`, for a signed-in request. */
function notionApi(request: IncomingMessage, url: URL, response: ServerResponse) {
  const path = url.pathname
  const pageId = /^\/v1\/pages\/([^/]+)$/.exec(path)?.[1]
  const blockId = /^\/v1\/blocks\/([^/]+)\/children$/.exec(path)?.[1]
  if (path === '/v1/users/me') {
    send(response, 200, {
      object: 'user',
      id: 'bot-surefy',
      name: 'SurefyOS',
      bot: { workspace_name: NOTION_WORKSPACE },
    })
  } else if (request.method === 'POST' && path === '/v1/search') {
    // the pages shared with the integration at the top: their children are reached by browsing
    const roots = [...notionPages.values()].filter((page) => page.parent === null)
    send(response, 200, { object: 'list', results: roots.map(notionPage), has_more: false })
  } else if (pageId !== undefined) {
    const page = notionPages.get(decodeURIComponent(pageId))
    if (page === undefined) notFound(response)
    else send(response, 200, notionPage(page))
  } else if (blockId !== undefined) {
    const children = notionChildren(decodeURIComponent(blockId))
    if (children === null) notFound(response)
    else send(response, 200, children)
  } else {
    // databases: none is shared with the integration
    notFound(response)
  }
}

function expire(app: App, response: ServerResponse) {
  for (const [token, owner] of [...accessTokens, ...refreshTokens]) {
    if (owner === app) {
      accessTokens.delete(token)
      refreshTokens.delete(token)
    }
  }
  send(response, 200, { ok: true })
}

type Handler = (request: IncomingMessage, url: URL, response: ServerResponse) => unknown

/** Fixed routes by `METHOD /path`; the APIs and the file control route are matched after these. */
const ROUTES: Readonly<Record<string, Handler>> = {
  'GET /health/live': (_request, _url, response) => {
    send(response, 200, { ok: true })
  },
  'GET /o/oauth2/v2/auth': (_request, url, response) => {
    authorize(url, response, 'google-drive')
  },
  'GET /v1/oauth/authorize': (_request, url, response) => {
    authorize(url, response, 'notion')
  },
  'POST /token': (request, _url, response) => googleToken(request, response),
  'POST /v1/oauth/token': (request, _url, response) => notionToken(request, response),
  'POST /revoke': (_request, _url, response) => {
    send(response, 200, {})
  },
  'POST /v1/oauth/revoke': (_request, _url, response) => {
    send(response, 200, {})
  },
  'POST /control/google-drive/expire': (_request, _url, response) => {
    expire('google-drive', response)
  },
  'POST /control/notion/expire': (_request, _url, response) => {
    expire('notion', response)
  },
  'GET /control/stats': (_request, _url, response) => {
    send(response, 200, { issued, downloads })
  },
}

/** An app's API answers only requests with a token it issued, as the real one does. */
function signedIn(app: App, api: Handler, refusal: unknown): Handler {
  return (request, url, response) => {
    if (isSignedIn(request, app)) api(request, url, response)
    else send(response, 401, refusal)
  }
}

const driveRoute = signedIn('google-drive', driveApi, {
  error: { code: 401, message: 'Invalid Credentials' },
})
const notionRoute = signedIn('notion', notionApi, {
  object: 'error',
  status: 401,
  code: 'unauthorized',
})

async function route(request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url ?? '/', 'http://localhost')
  const path = url.pathname
  const method = request.method ?? 'GET'
  const fixed = ROUTES[`${method} ${path}`]
  const driveFile = /^\/control\/google-drive\/files\/([^/]+)$/.exec(path)?.[1]
  if (fixed !== undefined) await fixed(request, url, response)
  else if (method === 'PUT' && driveFile !== undefined)
    await putDriveFile(decodeURIComponent(driveFile), request, response)
  else if (path.startsWith('/drive/v3/')) driveRoute(request, url, response)
  else if (path.startsWith('/v1/')) notionRoute(request, url, response)
  else send(response, 404, { error: `No route for ${method} ${path}` })
}

const server = createServer((request, response) => {
  route(request, response).catch((error: unknown) => {
    send(response, 500, { error: String(error) })
  })
})

server.listen(e2e.connectorPort, '127.0.0.1')
