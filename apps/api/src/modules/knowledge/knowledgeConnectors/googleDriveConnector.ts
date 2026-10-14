// SPDX-License-Identifier: AGPL-3.0-only
import { KNOWLEDGE_FILE_LIMITS, KNOWLEDGE_FILE_TYPES } from '@surefy/contracts'

import { KNOWLEDGE_CONNECTOR_FILES_MAX } from './knowledgeConnectors.types.js'

import type { ConnectorTransport } from './connectorTransport.js'
import type {
  ConnectorFile,
  ConnectorItemsPage,
  KnowledgeConnectorClient,
} from './knowledgeConnectors.types.js'

// Google Drive (Drive API v3, read-only scope). The picker shows folders: My Drive and the shared
// drives at the top, then one folder's subfolders. A sync walks the chosen folders breadth first
// and keeps the files Knowledge accepts; Google Docs, Sheets and Slides are exported as DOCX, XLSX
// and PPTX. A file's revision is its checksum, or its version for Google files, which have none.

export const GOOGLE_DRIVE_API = 'https://www.googleapis.com'

const FOLDER = 'application/vnd.google-apps.folder'
const MY_DRIVE = { externalId: 'root', name: 'My Drive' } as const

/** Google files and the format each is exported in. */
const EXPORTS: Readonly<Record<string, string>> = {
  'application/vnd.google-apps.document':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.google-apps.spreadsheet':
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.google-apps.presentation':
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}

const ACCEPTED: ReadonlySet<string> = new Set(KNOWLEDGE_FILE_TYPES)

/** Every list call reaches items in shared drives too. */
const ALL_DRIVES = {
  supportsAllDrives: 'true',
  includeItemsFromAllDrives: 'true',
  corpora: 'allDrives',
} as const

interface DriveFile {
  id?: unknown
  name?: unknown
  mimeType?: unknown
  md5Checksum?: unknown
  version?: unknown
  modifiedTime?: unknown
  size?: unknown
}

interface DriveList {
  files?: DriveFile[]
  drives?: { id?: unknown; name?: unknown }[]
  nextPageToken?: unknown
}

const str = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null

/** A literal inside a Drive query: backslashes and quotes escaped. */
const literal = (value: string): string =>
  `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`

const query = (params: Record<string, string | number | undefined>): string =>
  new URLSearchParams(
    Object.entries(params).flatMap(([key, value]): [string, string][] =>
      value === undefined ? [] : [[key, String(value)]],
    ),
  ).toString()

/** The document a Drive file becomes, or null when Knowledge cannot read it. */
function fileOf(file: DriveFile): ConnectorFile | null {
  const id = str(file.id)
  const mimeType = str(file.mimeType)
  if (id === null || mimeType === null) return null
  const exported = EXPORTS[mimeType]
  if (exported === undefined && !ACCEPTED.has(mimeType)) return null
  if (exported === undefined && Number(file.size) > KNOWLEDGE_FILE_LIMITS.maxBytes) return null
  const revision =
    str(file.md5Checksum) ??
    (str(file.version) === null ? null : `v${String(file.version)}`) ??
    str(file.modifiedTime)
  if (revision === null) return null
  return {
    externalId: id,
    title: str(file.name) ?? id,
    revision,
    ref: exported === undefined ? `media:${mimeType}` : `export:${exported}`,
  }
}

/** Subfolders join the walk; readable files join the source, up to the limit. */
function collect(entries: DriveFile[], queue: string[], files: Map<string, ConnectorFile>): void {
  for (const entry of entries) {
    if (entry.mimeType === FOLDER) {
      const id = str(entry.id)
      if (id !== null) queue.push(id)
      continue
    }
    const file = fileOf(entry)
    if (file !== null && files.size < KNOWLEDGE_CONNECTOR_FILES_MAX)
      files.set(file.externalId, file)
  }
}

export function createGoogleDriveConnector(
  transport: ConnectorTransport,
  apiBase: string = GOOGLE_DRIVE_API,
): KnowledgeConnectorClient {
  const filesUrl = `${apiBase}/drive/v3/files`

  const list = async (token: string, params: Record<string, string | number | undefined>) =>
    (await transport.json(
      'GET',
      `${filesUrl}?${query({ ...ALL_DRIVES, ...params })}`,
      token,
    )) as DriveList

  const folderItems = (files: DriveFile[] | undefined): ConnectorItemsPage['items'] =>
    (files ?? []).flatMap((file) => {
      const id = str(file.id)
      if (id === null) return []
      return [
        {
          externalId: id,
          name: str(file.name) ?? id,
          kind: 'folder' as const,
          hasChildren: true,
          path: null,
        },
      ]
    })

  return {
    provider: 'google_drive',

    async listItems(token, { parentId, q, limit, cursor }) {
      if (q !== undefined) {
        const found = await list(token, {
          q: `mimeType = '${FOLDER}' and trashed = false and name contains ${literal(q)}`,
          fields: 'nextPageToken,files(id,name)',
          orderBy: 'name',
          pageSize: limit,
          pageToken: cursor,
        })
        return { items: folderItems(found.files), nextCursor: str(found.nextPageToken) }
      }
      if (parentId === undefined) {
        // My Drive first, then the shared drives the account belongs to
        const drives = (await transport.json(
          'GET',
          `${apiBase}/drive/v3/drives?${query({ pageSize: limit, pageToken: cursor, fields: 'nextPageToken,drives(id,name)' })}`,
          token,
        )) as DriveList
        const shared = (drives.drives ?? []).flatMap((drive) => {
          const id = str(drive.id)
          if (id === null) return []
          return [
            {
              externalId: id,
              name: str(drive.name) ?? id,
              kind: 'folder' as const,
              hasChildren: true,
              path: 'Shared drives',
            },
          ]
        })
        const mine =
          cursor === undefined
            ? [{ ...MY_DRIVE, kind: 'folder' as const, hasChildren: true, path: null }]
            : []
        return { items: [...mine, ...shared], nextCursor: str(drives.nextPageToken) }
      }
      const children = await list(token, {
        q: `${literal(parentId)} in parents and mimeType = '${FOLDER}' and trashed = false`,
        fields: 'nextPageToken,files(id,name)',
        orderBy: 'name',
        pageSize: limit,
        pageToken: cursor,
      })
      return { items: folderItems(children.files), nextCursor: str(children.nextPageToken) }
    },

    async listFiles(token, folders) {
      const files = new Map<string, ConnectorFile>()
      const queue = folders.map((folder) => folder.externalId)
      const visited = new Set<string>()
      const full = () => files.size >= KNOWLEDGE_CONNECTOR_FILES_MAX
      while (queue.length > 0 && !full()) {
        const folderId = queue.shift()
        if (folderId === undefined || visited.has(folderId)) continue
        visited.add(folderId)
        let pageToken: string | undefined
        do {
          const page = await list(token, {
            q: `${literal(folderId)} in parents and trashed = false`,
            fields: 'nextPageToken,files(id,name,mimeType,md5Checksum,version,modifiedTime,size)',
            pageSize: 1000,
            pageToken,
          })
          collect(page.files ?? [], queue, files)
          pageToken = str(page.nextPageToken) ?? undefined
        } while (pageToken !== undefined && !full())
      }
      return [...files.values()]
    },

    async fetch(token, file) {
      const id = encodeURIComponent(file.externalId)
      if (file.ref.startsWith('export:')) {
        const mimeType = file.ref.slice('export:'.length)
        const exported = await transport.bytes(
          `${filesUrl}/${id}/export?${query({ mimeType })}`,
          token,
        )
        return { bytes: exported.bytes, mimeType }
      }
      const media = await transport.bytes(
        `${filesUrl}/${id}?${query({ alt: 'media', supportsAllDrives: 'true' })}`,
        token,
      )
      // the type Drive listed, which Knowledge accepts; the parser verifies it from the bytes
      return { bytes: media.bytes, mimeType: file.ref.slice('media:'.length) }
    },
  }
}
