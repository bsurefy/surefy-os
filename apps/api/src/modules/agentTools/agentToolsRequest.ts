// SPDX-License-Identifier: AGPL-3.0-only
import { BLOCKED_TOOL_HEADERS } from './agentTools.constants.js'

import type { ExecutableTool } from './agentTools.types.js'

// How the arguments a model fills in become an API request. Placeholders in the path (`{id}`) take
// their value from the argument of the same name; what is left goes to the query of a GET or
// DELETE and to the JSON body of a POST, PUT or PATCH. Nothing here puts a credential anywhere:
// those are added from the connection, in headers only.

type ApiTool = Extract<ExecutableTool, { kind: 'api' }>

const PLACEHOLDER = /%7B(\w+)%7D/gi
const BODY_METHODS: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH'])

export interface ApiRequest {
  url: string
  method: ApiTool['method']
  headers: Record<string, string>
  body: string | undefined
  /** Method, origin and path: safe to show. */
  target: string
}

const isScalar = (value: unknown): value is string | number | boolean =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'

/** The names in `{braces}` of the address's path. */
export function pathPlaceholders(url: string): string[] {
  try {
    const { pathname } = new URL(url)
    return [...new Set([...pathname.matchAll(PLACEHOLDER)].map((match) => match[1] ?? ''))]
  } catch {
    return []
  }
}

/** The JSON Schema the model sees: the tool's own, or one made from the path's placeholders. */
export function apiInputSchema(tool: ApiTool): Record<string, unknown> {
  if (tool.inputSchema !== null) return tool.inputSchema
  const names = pathPlaceholders(tool.url)
  return {
    type: 'object',
    properties: Object.fromEntries(names.map((name) => [name, { type: 'string' }])),
    required: names,
    additionalProperties: true,
  }
}

/** The non-secret headers of a tool, without the ones the HTTP client owns. */
export function toolHeaders(tool: ApiTool): Record<string, string> {
  const headers: Record<string, string> = {}
  for (const { name, value } of tool.headers) {
    if (!BLOCKED_TOOL_HEADERS.has(name.toLowerCase())) headers[name.toLowerCase()] = value
  }
  return headers
}

function missingRequired(schema: Record<string, unknown>, args: Record<string, unknown>) {
  const required = Array.isArray(schema.required) ? schema.required : []
  return required.find(
    (name): name is string =>
      typeof name === 'string' && (args[name] === undefined || args[name] === null),
  )
}

type Filled = { ok: true; rest: Record<string, unknown> } | { ok: false; message: string }

/** Puts the arguments named in the path into it; the rest of the arguments is what is left. */
function fillPath(url: URL, args: Record<string, unknown>): Filled {
  const used = new Set<string>()
  const problem: { message: string | null } = { message: null }
  url.pathname = url.pathname.replaceAll(PLACEHOLDER, (_, name: string) => {
    used.add(name)
    const value = args[name]
    if (!isScalar(value) || String(value) === '' || value === '.' || value === '..') {
      problem.message ??= `Missing or invalid argument "${name}"`
      return ''
    }
    return encodeURIComponent(String(value))
  })
  if (problem.message !== null) return { ok: false, message: problem.message }
  return { ok: true, rest: Object.fromEntries(Object.entries(args).filter(([k]) => !used.has(k))) }
}

/** Reads, deletes: the arguments go to the query, a list as repeated keys. */
function addQuery(url: URL, rest: Record<string, unknown>): void {
  for (const [name, value] of Object.entries(rest)) {
    const items: unknown[] = Array.isArray(value) ? (value as unknown[]) : [value]
    for (const item of items) {
      if (item === null || item === undefined) continue
      url.searchParams.append(name, isScalar(item) ? String(item) : JSON.stringify(item))
    }
  }
}

/** The request for `args`, or the sentence that tells the model what to fix. */
export function buildApiRequest(
  tool: ApiTool,
  args: Record<string, unknown>,
): { ok: true; request: ApiRequest } | { ok: false; message: string } {
  const missing = missingRequired(apiInputSchema(tool), args)
  if (missing !== undefined) return { ok: false, message: `Missing argument "${missing}"` }

  let url: URL
  try {
    url = new URL(tool.url)
  } catch {
    return { ok: false, message: 'The address of this tool is not valid' }
  }
  const filled = fillPath(url, args)
  if (!filled.ok) return filled

  const headers = toolHeaders(tool)
  let body: string | undefined
  if (!BODY_METHODS.has(tool.method)) {
    addQuery(url, filled.rest)
  } else if (Object.keys(filled.rest).length > 0) {
    body = JSON.stringify(filled.rest)
    headers['content-type'] = 'application/json'
  }
  return {
    ok: true,
    request: {
      url: url.toString(),
      method: tool.method,
      headers,
      body,
      target: `${tool.method} ${url.origin}${url.pathname}`,
    },
  }
}
