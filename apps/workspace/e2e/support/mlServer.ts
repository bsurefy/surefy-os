// SPDX-License-Identifier: AGPL-3.0-only
// A stand-in for the document parser (`apps/ml`) in the end-to-end run, started by Playwright next
// to the API. It answers `POST /v1/documents/parse` for plain text and Markdown: it downloads the
// file from the signed URL it is given and returns it as sections, one per heading or paragraph.
// It also answers `POST /v1/pii/detect` and `/v1/pii/mask` for emails, phone numbers and payment
// cards (and a custom pattern), the types the specs use; the real service finds more.
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

interface PiiBody {
  texts?: string[]
  types?: string[] | null
  customPatterns?: { label: string; pattern: string }[]
}

interface Finding {
  type: string
  customLabel: string | null
  start: number
  end: number
  score: number
}

/** The built-in types the stub can find; a type the request leaves out is not looked for. */
const PII_PATTERNS: Record<string, RegExp> = {
  email: /\b[\w.+-]{1,64}@[\w-]{1,63}(?:\.[\w-]{1,63}){1,4}\b/g,
  payment_card: /\b(?:\d[ -]?){13,16}\b/g,
  phone: /\+\d[\d ()-]{7,}\d/g,
}

/** The placeholder the real service writes for a finding: `[EMAIL]`, `[EMPLOYEE_ID]`. */
const placeholderOf = (finding: Finding) =>
  `[${(finding.customLabel ?? finding.type).toUpperCase().replaceAll(/\s+/g, '_')}]`

function findIn(text: string, body: PiiBody): Finding[] {
  const found: Finding[] = []
  const wanted = body.types ?? Object.keys(PII_PATTERNS)
  for (const [type, pattern] of Object.entries(PII_PATTERNS)) {
    if (!wanted.includes(type)) continue
    for (const match of text.matchAll(pattern))
      found.push({
        type,
        customLabel: null,
        start: match.index,
        end: match.index + match[0].length,
        score: 0.9,
      })
  }
  for (const custom of body.customPatterns ?? []) {
    for (const match of text.matchAll(new RegExp(custom.pattern, 'g')))
      found.push({
        type: 'custom',
        customLabel: custom.label,
        start: match.index,
        end: match.index + match[0].length,
        score: 1,
      })
  }
  return found.sort((a, b) => a.start - b.start)
}

/** Findings that do not overlap an earlier one, in text order. */
function withoutOverlap(findings: Finding[]): Finding[] {
  const kept: Finding[] = []
  for (const finding of findings) {
    if (finding.start >= (kept.at(-1)?.end ?? 0)) kept.push(finding)
  }
  return kept
}

function maskText(text: string, findings: Finding[]): string {
  let out = ''
  let at = 0
  for (const finding of findings) {
    out += text.slice(at, finding.start) + placeholderOf(finding)
    at = finding.end
  }
  return out + text.slice(at)
}

async function readJson<T extends object>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(chunk as Buffer)
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as T
}

async function pii(request: IncomingMessage, response: ServerResponse, mask: boolean) {
  const body = await readJson<PiiBody>(request)
  const results = (body.texts ?? []).map((text) => {
    const findings = withoutOverlap(findIn(text, body))
    return mask ? { findings, text: maskText(text, findings) } : { findings }
  })
  send(response, 200, { language: 'en', results })
}

const send = (response: ServerResponse, status: number, body: unknown) => {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(body))
}

async function parse(request: IncomingMessage, response: ServerResponse) {
  const { fileUrl } = await readJson<{ fileUrl?: string }>(request)
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
  } else if (request.method === 'POST' && (path === '/v1/pii/detect' || path === '/v1/pii/mask')) {
    pii(request, response, path.endsWith('mask')).catch((error: unknown) => {
      send(response, 500, { error: String(error) })
    })
  } else if (request.method === 'POST' && path === '/v1/documents/parse') {
    parse(request, response).catch((error: unknown) => {
      send(response, 500, { error: String(error) })
    })
  } else {
    send(response, 404, { error: `No route for ${request.method ?? ''} ${path}` })
  }
})

server.listen(e2e.mlPort, '127.0.0.1')
