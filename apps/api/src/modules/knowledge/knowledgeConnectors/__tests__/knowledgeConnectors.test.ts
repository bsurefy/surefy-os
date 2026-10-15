// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { createFakeHttp } from '../../../../../test/fixtures/fakeHttp.js'
import { createConnectorTransport, type ConnectorTransport } from '../connectorTransport.js'
import { createGoogleDriveConnector } from '../googleDriveConnector.js'
import {
  ConnectorExpiredError,
  ConnectorItemError,
  ConnectorUnavailableError,
} from '../knowledgeConnectors.types.js'
import { createNotionConnector } from '../notionConnector.js'
import { blocksToMarkdown, propertiesToMarkdown } from '../notionMarkdown.js'

import type { SafeGet } from '../../knowledgeIngestion/safeFetch.js'

/** A transport answering JSON calls from a function of method, URL and body; downloads by URL. */
function fakeTransport(
  json: (method: string, url: URL, body: unknown) => unknown,
  files: Record<string, string> = {},
) {
  const calls: string[] = []
  const transport: ConnectorTransport = {
    json: (method, url, token, options = {}) => {
      calls.push(`${method} ${url}`)
      expect(token).toBe('token-1')
      return Promise.resolve().then(() => json(method, new URL(url), options.body))
    },
    bytes: (url) => {
      calls.push(`GET ${url}`)
      const found = Object.entries(files).find(([match]) => url.includes(match))
      if (found === undefined) return Promise.reject(new ConnectorItemError(404, 'gone'))
      return Promise.resolve({ bytes: Buffer.from(found[1]), mimeType: null })
    },
  }
  return { transport, calls }
}

const FOLDER = 'application/vnd.google-apps.folder'
const PDF = 'application/pdf'
const DOC = 'application/vnd.google-apps.document'
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

const query = { parentId: undefined, q: undefined, limit: 50, cursor: undefined }

describe('Google Drive connector', () => {
  it('lists My Drive and the shared drives at the top, then subfolders', async () => {
    const { transport, calls } = fakeTransport((_method, url) => {
      if (url.pathname.endsWith('/drives')) {
        return { drives: [{ id: 'drive-fin', name: 'Finance' }], nextPageToken: 'next-1' }
      }
      expect(url.searchParams.get('q')).toBe(
        `'root' in parents and mimeType = '${FOLDER}' and trashed = false`,
      )
      return { files: [{ id: 'f-hr', name: 'HR' }] }
    })
    const drive = createGoogleDriveConnector(transport)

    const top = await drive.listItems('token-1', query)
    expect(top).toEqual({
      items: [
        { externalId: 'root', name: 'My Drive', kind: 'folder', hasChildren: true, path: null },
        {
          externalId: 'drive-fin',
          name: 'Finance',
          kind: 'folder',
          hasChildren: true,
          path: 'Shared drives',
        },
      ],
      nextCursor: 'next-1',
    })
    // the next page of shared drives does not repeat My Drive
    expect((await drive.listItems('token-1', { ...query, cursor: 'next-1' })).items).toHaveLength(1)

    const children = await drive.listItems('token-1', { ...query, parentId: 'root' })
    expect(children.items.map((item) => item.name)).toEqual(['HR'])
    expect(calls.at(-1)).toContain('supportsAllDrives=true')
  })

  it('escapes a search and finds folders by name', async () => {
    const { transport } = fakeTransport((_method, url) => {
      expect(url.searchParams.get('q')).toBe(
        `mimeType = '${FOLDER}' and trashed = false and name contains 'Bob\\'s'`,
      )
      return { files: [{ id: 'f-bob', name: "Bob's" }] }
    })
    const found = await createGoogleDriveConnector(transport).listItems('token-1', {
      ...query,
      q: "Bob's",
    })
    expect(found.items[0]?.externalId).toBe('f-bob')
  })

  it('walks subfolders, keeps what Knowledge reads, and exports Google files', async () => {
    const { transport } = fakeTransport((_method, url) => {
      const q = url.searchParams.get('q') ?? ''
      if (q.startsWith("'f-hr'")) {
        if (url.searchParams.get('pageToken') === null) {
          return {
            files: [
              { id: 'p-1', name: 'Leave.pdf', mimeType: PDF, md5Checksum: 'md5-1', size: '10' },
              { id: 'f-sub', name: 'Old', mimeType: FOLDER },
            ],
            nextPageToken: 'page-2',
          }
        }
        return {
          files: [
            { id: 'd-1', name: 'Handbook', mimeType: DOC, version: '7' },
            { id: 'z-1', name: 'Archive.zip', mimeType: 'application/zip', md5Checksum: 'x' },
            { id: 'big', name: 'Huge.pdf', mimeType: PDF, md5Checksum: 'y', size: '999999999999' },
          ],
        }
      }
      if (q.startsWith("'f-sub'")) {
        return { files: [{ id: 'p-2', name: 'Pay.pdf', mimeType: PDF, md5Checksum: 'md5-2' }] }
      }
      return { files: [] }
    })
    const drive = createGoogleDriveConnector(transport)
    const files = await drive.listFiles('token-1', [{ externalId: 'f-hr', name: 'HR' }])
    expect(files).toEqual([
      { externalId: 'p-1', title: 'Leave.pdf', revision: 'md5-1', ref: `media:${PDF}` },
      { externalId: 'd-1', title: 'Handbook', revision: 'v7', ref: `export:${DOCX}` },
      { externalId: 'p-2', title: 'Pay.pdf', revision: 'md5-2', ref: `media:${PDF}` },
    ])
  })

  it('downloads files and exports Google files in the listed format', async () => {
    const { transport, calls } = fakeTransport(() => ({}), {
      '/files/p-1?alt=media': 'pdf bytes',
      '/files/d-1/export': 'docx bytes',
    })
    const drive = createGoogleDriveConnector(transport)
    expect(
      await drive.fetch('token-1', {
        externalId: 'p-1',
        title: 'L',
        revision: 'r',
        ref: `media:${PDF}`,
      }),
    ).toEqual({ bytes: Buffer.from('pdf bytes'), mimeType: PDF })
    expect(
      await drive.fetch('token-1', {
        externalId: 'd-1',
        title: 'H',
        revision: 'r',
        ref: `export:${DOCX}`,
      }),
    ).toEqual({ bytes: Buffer.from('docx bytes'), mimeType: DOCX })
    expect(calls.at(-1)).toContain(`mimeType=${encodeURIComponent(DOCX)}`)
  })
})

const page = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  object: 'page',
  id,
  last_edited_time: `2026-10-01T10:00:00.000Z#${id}`,
  parent: { type: 'workspace' },
  properties: { Name: { type: 'title', title: [{ plain_text: title }] } },
  ...extra,
})

describe('Notion connector', () => {
  it('lists the shared pages and databases, then a page’s child pages', async () => {
    const { transport } = fakeTransport((method, url, body) => {
      if (method === 'POST') {
        expect(body).toEqual({ query: 'hand', page_size: 50 })
        return {
          results: [
            page('pg-1', 'Handbook'),
            { object: 'database', id: 'db-1', title: [{ plain_text: 'Hand-offs' }] },
            page('pg-gone', 'Old', { archived: true }),
          ],
          has_more: false,
        }
      }
      expect(url.pathname).toBe('/v1/blocks/pg-1/children')
      return {
        results: [
          { id: 'b-1', type: 'paragraph', paragraph: { rich_text: [] } },
          { id: 'pg-2', type: 'child_page', child_page: { title: 'Leave' } },
          { id: 'db-2', type: 'child_database', child_database: { title: 'Holidays' } },
        ],
        has_more: true,
        next_cursor: 'c-2',
      }
    })
    const notion = createNotionConnector(transport)
    const found = await notion.listItems('token-1', { ...query, q: 'hand' })
    expect(found.items).toEqual([
      { externalId: 'pg-1', name: 'Handbook', kind: 'page', hasChildren: true, path: null },
      { externalId: 'db-1', name: 'Hand-offs', kind: 'database', hasChildren: false, path: null },
    ])
    const children = await notion.listItems('token-1', { ...query, parentId: 'pg-1' })
    expect(children.items.map((item) => [item.externalId, item.kind])).toEqual([
      ['pg-2', 'page'],
      ['db-2', 'database'],
    ])
    expect(children.nextCursor).toBe('c-2')
  })

  it('syncs a page with its child pages, and a database with its rows', async () => {
    const { transport } = fakeTransport((method, url) => {
      const path = url.pathname
      if (path === '/v1/pages/pg-1') return page('pg-1', 'Handbook')
      if (path === '/v1/pages/pg-2') return page('pg-2', 'Leave')
      if (path === '/v1/pages/db-1') throw new ConnectorItemError(400, 'a database')
      if (path === '/v1/databases/db-1') return { object: 'database', id: 'db-1' }
      if (path === '/v1/pages/gone') throw new ConnectorItemError(404, 'gone')
      if (path === '/v1/databases/gone') throw new ConnectorItemError(404, 'gone')
      if (path === '/v1/blocks/pg-1/children') {
        return { results: [{ id: 'pg-2', type: 'child_page', child_page: { title: 'Leave' } }] }
      }
      if (path === '/v1/blocks/pg-2/children') return { results: [] }
      if (method === 'POST' && path === '/v1/databases/db-1/query') {
        return { results: [page('row-1', 'Alice'), page('row-2', 'Bob')], has_more: false }
      }
      throw new Error(`unexpected ${method} ${path}`)
    })
    const files = await createNotionConnector(transport).listFiles('token-1', [
      { externalId: 'pg-1', name: 'Handbook' },
      { externalId: 'db-1', name: 'People' },
      { externalId: 'gone', name: 'Gone' },
    ])
    expect(files.map((file) => [file.externalId, file.title])).toEqual([
      ['pg-1', 'Handbook'],
      ['pg-2', 'Leave'],
      ['row-1', 'Alice'],
      ['row-2', 'Bob'],
    ])
    expect(files[0]?.revision).toBe('2026-10-01T10:00:00.000Z#pg-1')
  })

  it('writes a page as Markdown with nested blocks and a row’s properties', async () => {
    const { transport } = fakeTransport((_method, url) => {
      if (url.pathname === '/v1/pages/row-1') {
        return page('row-1', 'Alice', {
          parent: { type: 'database_id' },
          properties: {
            Name: { type: 'title', title: [{ plain_text: 'Alice' }] },
            Team: { type: 'select', select: { name: 'Finance' } },
          },
        })
      }
      if (url.pathname === '/v1/blocks/row-1/children') {
        return {
          results: [
            { id: 'h', type: 'heading_2', heading_2: { rich_text: [{ plain_text: 'Duties' }] } },
            {
              id: 'li',
              type: 'bulleted_list_item',
              has_children: true,
              bulleted_list_item: { rich_text: [{ plain_text: 'Payroll' }] },
            },
          ],
        }
      }
      if (url.pathname === '/v1/blocks/li/children') {
        return {
          results: [
            {
              id: 'n',
              type: 'bulleted_list_item',
              bulleted_list_item: { rich_text: [{ plain_text: 'Monthly' }] },
            },
          ],
        }
      }
      throw new Error(`unexpected ${url.pathname}`)
    })
    const content = await createNotionConnector(transport).fetch('token-1', {
      externalId: 'row-1',
      title: 'Alice',
      revision: 'r',
      ref: 'page',
    })
    expect(content.mimeType).toBe('text/markdown')
    expect(content.bytes.toString('utf8')).toBe(
      '# Alice\n\n**Team:** Finance\n\n## Duties\n\n- Payroll\n  - Monthly\n',
    )
  })
})

describe('Notion Markdown', () => {
  it('keeps marks, lists, code and tables', () => {
    const markdown = blocksToMarkdown([
      {
        type: 'paragraph',
        paragraph: {
          rich_text: [
            { plain_text: 'Read ' },
            { plain_text: 'this', annotations: { bold: true }, href: 'https://a.test' },
          ],
        },
      },
      { type: 'numbered_list_item', numbered_list_item: { rich_text: [{ plain_text: 'One' }] } },
      { type: 'numbered_list_item', numbered_list_item: { rich_text: [{ plain_text: 'Two' }] } },
      { type: 'to_do', to_do: { checked: true, rich_text: [{ plain_text: 'Done' }] } },
      { type: 'code', code: { language: 'sql', rich_text: [{ plain_text: 'select 1' }] } },
      {
        type: 'table',
        table: {},
        children: [
          {
            type: 'table_row',
            table_row: { cells: [[{ plain_text: 'A' }], [{ plain_text: 'B' }]] },
          },
          {
            type: 'table_row',
            table_row: { cells: [[{ plain_text: '1' }], [{ plain_text: '2|3' }]] },
          },
        ],
      },
      { type: 'child_page', child_page: { title: 'Elsewhere' } },
    ])
    expect(markdown).toBe(
      [
        'Read [**this**](https://a.test)',
        '1. One',
        '2. Two',
        '- [x] Done',
        '```sql\nselect 1\n```',
        '| A | B |\n| --- | --- |\n| 1 | 2\\|3 |',
      ].join('\n\n'),
    )
  })

  it('writes the properties a row has, leaving the title out', () => {
    expect(
      propertiesToMarkdown({
        Name: { type: 'title', title: [{ plain_text: 'Alice' }] },
        Tags: { type: 'multi_select', multi_select: [{ name: 'a' }, { name: 'b' }] },
        Active: { type: 'checkbox', checkbox: false },
        Start: { type: 'date', date: { start: '2026-01-01', end: null } },
        Empty: { type: 'rich_text', rich_text: [] },
      }),
    ).toBe('**Tags:** a, b\n**Active:** No\n**Start:** 2026-01-01')
  })
})

describe('connector transport', () => {
  const get: SafeGet = (url, options) =>
    Promise.resolve({
      status: url.includes('/missing') ? 404 : 200,
      headers: { 'content-type': 'application/pdf; charset=binary' },
      body: Buffer.from(options?.headers?.authorization ?? ''),
      url,
    })

  it('maps answers to the connector errors', async () => {
    const http = createFakeHttp()
    http.on('/expired', { status: 401 })
    http.on('/busy', { status: 503 })
    http.on('/forbidden', { status: 403, body: { error: { message: 'no access' } } })
    http.on('/ok', { body: { ok: true } })
    http.on('/limited', { status: 429, headers: { 'retry-after': '0.001' } })
    const transport = createConnectorTransport({ http, get })

    expect(await transport.json('GET', 'https://api.test/ok', 'token-1')).toEqual({ ok: true })
    expect(http.calls[0]?.request.headers?.authorization).toBe('Bearer token-1')
    await expect(transport.json('GET', 'https://api.test/expired', 't')).rejects.toBeInstanceOf(
      ConnectorExpiredError,
    )
    await expect(transport.json('GET', 'https://api.test/busy', 't')).rejects.toBeInstanceOf(
      ConnectorUnavailableError,
    )
    await expect(transport.json('GET', 'https://api.test/forbidden', 't')).rejects.toMatchObject({
      status: 403,
    })
    // a rate limit is waited out a few times, then reported as an outage
    await expect(transport.json('GET', 'https://api.test/limited', 't')).rejects.toBeInstanceOf(
      ConnectorUnavailableError,
    )
    expect(http.callsTo('/limited')).toHaveLength(3)
  })

  it('downloads bytes with the token and the type the app sent', async () => {
    const transport = createConnectorTransport({ http: createFakeHttp(), get })
    expect(await transport.bytes('https://files.test/a', 'token-1')).toEqual({
      bytes: Buffer.from('Bearer token-1'),
      mimeType: 'application/pdf',
    })
    await expect(transport.bytes('https://files.test/missing', 't')).rejects.toMatchObject({
      status: 404,
    })
  })
})
