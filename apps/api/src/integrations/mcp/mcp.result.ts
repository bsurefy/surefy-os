// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { McpError } from './mcp.errors.js'

import type { McpCallResult, McpToolInfo } from './mcp.types.js'

// The shapes of `tools/list` and `tools/call` answers, read leniently: a field a server gets
// wrong is dropped, a tool without a usable name is skipped, nothing here throws for a quirk.

const toolSchema = z.object({
  name: z.string().min(1).max(200),
  title: z.string().nullish().catch(null),
  description: z.string().nullish().catch(null),
  inputSchema: z.record(z.string(), z.unknown()).nullish().catch(null),
  annotations: z
    .object({
      title: z.string().nullish().catch(null),
      readOnlyHint: z.boolean().nullish().catch(null),
      destructiveHint: z.boolean().nullish().catch(null),
    })
    .nullish()
    .catch(null),
})

const listSchema = z.object({
  tools: z.array(z.unknown()),
  nextCursor: z.string().min(1).nullish().catch(null),
})

export interface ToolPage {
  tools: McpToolInfo[]
  nextCursor: string | null
}

export function readToolPage(result: unknown): ToolPage {
  const page = listSchema.safeParse(result)
  if (!page.success) throw new McpError('protocol', 'The server sent a tool list that is not valid')
  const tools: McpToolInfo[] = []
  for (const candidate of page.data.tools) {
    const parsed = toolSchema.safeParse(candidate)
    if (!parsed.success) continue
    const tool = parsed.data
    tools.push({
      name: tool.name,
      description: tool.description ?? '',
      inputSchema: tool.inputSchema ?? { type: 'object', properties: {} },
      title: tool.title ?? tool.annotations?.title ?? null,
      readOnlyHint: tool.annotations?.readOnlyHint ?? null,
      destructiveHint: tool.annotations?.destructiveHint ?? null,
    })
  }
  return { tools, nextCursor: page.data.nextCursor ?? null }
}

const callSchema = z.object({
  content: z.array(z.unknown()).catch([]),
  structuredContent: z.unknown().optional(),
  isError: z.boolean().catch(false),
})

const textPart = z.object({ type: z.literal('text'), text: z.string() })
const resourcePart = z.object({
  type: z.literal('resource'),
  resource: z.object({ uri: z.string(), text: z.string().optional() }),
})
const linkPart = z.object({
  type: z.literal('resource_link'),
  uri: z.string(),
  name: z.string().optional(),
})
const mediaPart = z.object({
  type: z.enum(['image', 'audio']),
  mimeType: z.string().catch('unknown'),
})

function partText(part: unknown): string | null {
  const text = textPart.safeParse(part)
  if (text.success) return text.data.text
  const resource = resourcePart.safeParse(part)
  if (resource.success)
    return resource.data.resource.text ?? `[resource: ${resource.data.resource.uri}]`
  const link = linkPart.safeParse(part)
  if (link.success) return `[link: ${link.data.name ?? link.data.uri}]`
  const media = mediaPart.safeParse(part)
  if (media.success) return `[${media.data.type}: ${media.data.mimeType}]`
  return null
}

export function readCallResult(result: unknown): McpCallResult {
  const parsed = callSchema.safeParse(result)
  if (!parsed.success) throw new McpError('protocol', 'The server sent a result that is not valid')
  const { content, structuredContent, isError } = parsed.data
  const lines = content.map(partText).filter((line): line is string => line !== null)
  let text = lines.join('\n')
  if (lines.length === 0 && structuredContent !== undefined)
    text = JSON.stringify(structuredContent)
  return { text, structuredContent: structuredContent ?? null, isError }
}
