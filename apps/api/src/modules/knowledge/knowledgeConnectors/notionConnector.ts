// SPDX-License-Identifier: AGPL-3.0-only
import { ConnectorItemError, KNOWLEDGE_CONNECTOR_FILES_MAX } from './knowledgeConnectors.types.js'
import {
  blocksToMarkdown,
  pageTitle,
  plainText,
  propertiesToMarkdown,
  type NotionBlock,
} from './notionMarkdown.js'

import type { ConnectorTransport } from './connectorTransport.js'
import type {
  ConnectorFile,
  ConnectorItemsPage,
  KnowledgeConnectorClient,
} from './knowledgeConnectors.types.js'

// Notion (API version 2022-06-28). The integration sees the pages and databases people shared
// with it. The picker lists them (search), then a page's child pages and databases. A chosen page
// syncs with its child pages; a chosen database syncs its rows. Each page becomes one Markdown
// document; its revision is its last edit time.

export const NOTION_API = 'https://api.notion.com'
const NOTION_VERSION = { 'notion-version': '2022-06-28' } as const

/** How deep child pages are followed, and nested blocks loaded, below a chosen page. */
const PAGE_DEPTH_MAX = 10
const BLOCK_DEPTH_MAX = 3
/** Blocks read per page; a longer page is indexed up to here. */
const BLOCKS_PER_PAGE_MAX = 2000
const PAGE_SIZE = 100

interface NotionObject {
  object?: unknown
  id?: unknown
  type?: unknown
  archived?: unknown
  in_trash?: unknown
  last_edited_time?: unknown
  properties?: unknown
  title?: unknown
  parent?: { type?: unknown }
  has_children?: unknown
  child_page?: { title?: unknown }
  child_database?: { title?: unknown }
}

interface NotionList {
  results?: NotionObject[]
  has_more?: unknown
  next_cursor?: unknown
}

const str = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null

const isGone = (item: NotionObject): boolean => item.archived === true || item.in_trash === true

/** A page or database id Notion does not know, or does not share with the integration. */
const isMissing = (error: unknown): boolean =>
  error instanceof ConnectorItemError && (error.status === 404 || error.status === 400)

export function createNotionConnector(
  transport: ConnectorTransport,
  apiBase: string = NOTION_API,
): KnowledgeConnectorClient {
  const get = async (token: string, path: string) =>
    (await transport.json('GET', `${apiBase}/v1${path}`, token, {
      headers: NOTION_VERSION,
    })) as NotionObject & NotionList
  const post = async (token: string, path: string, body: unknown) =>
    (await transport.json('POST', `${apiBase}/v1${path}`, token, {
      body,
      headers: NOTION_VERSION,
    })) as NotionList

  const children = (token: string, blockId: string, cursor: string | undefined) =>
    get(
      token,
      `/blocks/${encodeURIComponent(blockId)}/children?page_size=${String(PAGE_SIZE)}${
        cursor === undefined ? '' : `&start_cursor=${encodeURIComponent(cursor)}`
      }`,
    )

  const fileOf = (page: NotionObject): ConnectorFile | null => {
    const id = str(page.id)
    const revision = str(page.last_edited_time)
    if (id === null || revision === null || isGone(page)) return null
    return {
      externalId: id,
      title: pageTitle(page.properties) ?? 'Untitled',
      revision,
      ref: 'page',
    }
  }

  /** The page or database behind a chosen id; null when it is gone or no longer shared. */
  const retrieve = async (
    token: string,
    id: string,
  ): Promise<{ kind: 'page' | 'database'; item: NotionObject } | null> => {
    for (const kind of ['page', 'database'] as const) {
      try {
        const item = await get(token, `/${kind}s/${encodeURIComponent(id)}`)
        return isGone(item) ? null : { kind, item }
      } catch (error) {
        if (!isMissing(error)) throw error
      }
    }
    return null
  }

  /** Every block of a page, nested ones loaded under their parent, up to the limits. */
  const loadBlocks = async (
    token: string,
    blockId: string,
    depth: number,
    budget: { left: number },
  ) => {
    const blocks: NotionBlock[] = []
    let cursor: string | undefined
    do {
      const page = await children(token, blockId, cursor)
      for (const raw of page.results ?? []) {
        if (budget.left <= 0) return blocks
        budget.left -= 1
        const block = raw as NotionBlock
        const id = str(raw.id)
        const nested =
          raw.has_children === true &&
          raw.type !== 'child_page' &&
          raw.type !== 'child_database' &&
          id !== null &&
          depth < BLOCK_DEPTH_MAX
        blocks.push(
          nested ? { ...block, children: await loadBlocks(token, id, depth + 1, budget) } : block,
        )
      }
      cursor = page.has_more === true ? (str(page.next_cursor) ?? undefined) : undefined
    } while (cursor !== undefined)
    return blocks
  }

  return {
    provider: 'notion',

    async listItems(token, { parentId, q, limit, cursor }) {
      if (parentId === undefined) {
        const found = await post(token, '/search', {
          ...(q === undefined ? {} : { query: q }),
          page_size: limit,
          ...(cursor === undefined ? {} : { start_cursor: cursor }),
        })
        const items = (found.results ?? []).flatMap((item): ConnectorItemsPage['items'] => {
          const id = str(item.id)
          if (id === null || isGone(item)) return []
          if (item.object === 'database') {
            const name = plainText(item.title).trim()
            return [
              {
                externalId: id,
                name: name === '' ? 'Untitled' : name,
                kind: 'database',
                hasChildren: false,
                path: null,
              },
            ]
          }
          return [
            {
              externalId: id,
              name: pageTitle(item.properties) ?? 'Untitled',
              kind: 'page',
              hasChildren: true,
              path: null,
            },
          ]
        })
        return { items, nextCursor: found.has_more === true ? str(found.next_cursor) : null }
      }
      const page = await children(token, parentId, cursor)
      const items = (page.results ?? []).flatMap((block): ConnectorItemsPage['items'] => {
        const id = str(block.id)
        if (id === null) return []
        if (block.type === 'child_page') {
          return [
            {
              externalId: id,
              name: str(block.child_page?.title) ?? 'Untitled',
              kind: 'page',
              hasChildren: true,
              path: null,
            },
          ]
        }
        if (block.type === 'child_database') {
          return [
            {
              externalId: id,
              name: str(block.child_database?.title) ?? 'Untitled',
              kind: 'database',
              hasChildren: false,
              path: null,
            },
          ]
        }
        return []
      })
      return {
        items: items.slice(0, limit),
        nextCursor: page.has_more === true ? str(page.next_cursor) : null,
      }
    },

    async listFiles(token, folders) {
      const files = new Map<string, ConnectorFile>()
      const visited = new Set<string>()
      const full = () => files.size >= KNOWLEDGE_CONNECTOR_FILES_MAX

      const add = (page: NotionObject) => {
        const file = fileOf(page)
        if (file !== null && !full()) files.set(file.externalId, file)
      }

      const walkDatabase = async (databaseId: string) => {
        let cursor: string | undefined
        do {
          const rows = await post(token, `/databases/${encodeURIComponent(databaseId)}/query`, {
            page_size: PAGE_SIZE,
            ...(cursor === undefined ? {} : { start_cursor: cursor }),
          })
          for (const row of rows.results ?? []) add(row)
          cursor = rows.has_more === true ? (str(rows.next_cursor) ?? undefined) : undefined
        } while (cursor !== undefined && !full())
      }

      /** A child page or database block of a page being walked. */
      const follow = async (block: NotionObject, depth: number): Promise<void> => {
        const childId = str(block.id)
        if (childId === null || visited.has(childId)) return
        if (block.type === 'child_database') {
          visited.add(childId)
          await walkDatabase(childId)
        } else if (block.type === 'child_page') {
          const child = await retrieve(token, childId)
          if (child?.kind === 'page') await walkPage(child.item, depth + 1)
        }
      }

      const walkPage = async (page: NotionObject, depth: number): Promise<void> => {
        const id = str(page.id)
        if (id === null || visited.has(id)) return
        visited.add(id)
        add(page)
        if (depth >= PAGE_DEPTH_MAX) return
        let cursor: string | undefined
        do {
          const blocks = await children(token, id, cursor)
          for (const block of blocks.results ?? []) {
            if (full()) return
            await follow(block, depth)
          }
          cursor = blocks.has_more === true ? (str(blocks.next_cursor) ?? undefined) : undefined
        } while (cursor !== undefined)
      }

      for (const folder of folders) {
        if (full()) break
        const found = await retrieve(token, folder.externalId)
        if (found === null) continue
        if (found.kind === 'database') {
          if (visited.has(folder.externalId)) continue
          visited.add(folder.externalId)
          await walkDatabase(folder.externalId)
        } else {
          await walkPage(found.item, 0)
        }
      }
      return [...files.values()]
    },

    async fetch(token, file) {
      const page = await get(token, `/pages/${encodeURIComponent(file.externalId)}`)
      const title = pageTitle(page.properties) ?? file.title
      const properties =
        page.parent?.type === 'database_id' &&
        typeof page.properties === 'object' &&
        page.properties !== null
          ? propertiesToMarkdown(page.properties as Record<string, unknown>)
          : ''
      const blocks = blocksToMarkdown(
        await loadBlocks(token, file.externalId, 0, { left: BLOCKS_PER_PAGE_MAX }),
      )
      const markdown = [`# ${title}`, properties, blocks].filter((part) => part !== '').join('\n\n')
      return { bytes: Buffer.from(`${markdown}\n`, 'utf8'), mimeType: 'text/markdown' }
    },
  }
}
