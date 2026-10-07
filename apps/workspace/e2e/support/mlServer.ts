// SPDX-License-Identifier: AGPL-3.0-only
// A stand-in for the document parser (`apps/ml`) in the end-to-end run, started by Playwright next
// to the API. It answers `POST /v1/documents/parse` for plain text and Markdown: it downloads the
// file from the signed URL it is given and returns it as sections, one per heading or paragraph.
import { createServer } from 'node:http'

import { e2e } from './env'

import type { IncomingMessage, ServerResponse } from 'node:http'

interface Section {
  headingPath: string[]
  pageFrom: number | null
  pageTo: number | null
  text: string
}

/** The text of a Markdown heading line (`# Title` to `###### Title`), or null for any other line. */
function headingOf(line: string): string | null {
  let level = 0
  while (line[level] === '#') level += 1
  return level >= 1 && level <= 6 && line[level] === ' ' ? line.slice(level + 1).trim() : null
}

/** Sections of a Markdown or plain text file: a heading starts one, a blank line ends a paragraph. */
export function sectionsOf(text: string): { title: string | null; sections: Section[] } {
  const sections: Section[] = []
  let heading: string | null = null
  let title: string | null = null
  for (const block of text.split(/\n\s*\n/)) {
    const lines = block.split('\n')
    const found = headingOf(lines[0] ?? '')
    if (found !== null) {
      heading = found
      title ??= heading
      lines.shift()
    }
    const body = lines.join(' ').trim()
    if (body !== '') {
      sections.push({
        headingPath: heading === null ? [] : [heading],
        pageFrom: 1,
        pageTo: 1,
        text: body,
      })
    }
  }
  return { title, sections }
}

async function readJson(request: IncomingMessage): Promise<{ fileUrl?: string }> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(chunk as Buffer)
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as { fileUrl?: string }
}

const send = (response: ServerResponse, status: number, body: unknown) => {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(body))
}

async function parse(request: IncomingMessage, response: ServerResponse) {
  const { fileUrl } = await readJson(request)
  if (fileUrl === undefined) {
    send(response, 422, { error: 'fileUrl is required' })
    return
  }
  const file = await fetch(fileUrl)
  if (!file.ok) {
    send(response, 502, { error: `the file could not be read: ${String(file.status)}` })
    return
  }
  const { title, sections } = sectionsOf(await file.text())
  send(response, 200, {
    language: 'en',
    pages: 1,
    sections,
    tables: [],
    title,
    usedOcr: false,
  })
}

const server = createServer((request, response) => {
  const path = new URL(request.url ?? '/', 'http://localhost').pathname
  if (request.method === 'GET' && path === '/health/live') {
    send(response, 200, { ok: true })
  } else if (request.method === 'POST' && path === '/v1/documents/parse') {
    parse(request, response).catch((error: unknown) => {
      send(response, 500, { error: String(error) })
    })
  } else {
    send(response, 404, { error: `No route for ${request.method ?? ''} ${path}` })
  }
})

server.listen(e2e.mlPort, '127.0.0.1')
