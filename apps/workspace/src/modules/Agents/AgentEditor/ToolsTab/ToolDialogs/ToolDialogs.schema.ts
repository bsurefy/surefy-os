// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { AGENT_HTTP_METHODS } from '@surefy/contracts'
import type { AgentMcpAction, AgentTool } from '@surefy/contracts'

import { newToolId } from '../ToolsTab.utils'

type ApiTool = Extract<AgentTool, { kind: 'api' }>
type McpTool = Extract<AgentTool, { kind: 'mcp' }>

const HEADER_NAME_PATTERN = /^[A-Za-z0-9-]+$/
const URL_MAX = 2048

/** What the forms say when a value is not acceptable; translated by the caller. */
export interface ToolFormMessages {
  name: string
  nameTaken: string
  url: string
  header: string
  inputSchema: string
}

const addressSchema = (message: string) =>
  z.url({ protocol: /^https?$/, error: message }).max(URL_MAX, message)

function nameSchema(
  messages: Pick<ToolFormMessages, 'name' | 'nameTaken'>,
  isNameTaken: (name: string) => boolean,
) {
  return z
    .string()
    .trim()
    .min(1, messages.name)
    .max(100, messages.name)
    .refine((name) => !isNameTaken(name), messages.nameTaken)
}

/** Reads the arguments' JSON Schema the person typed: empty is none, anything else must be an object. */
export function parseJsonObject(text: string): Record<string, unknown> | null | undefined {
  if (text.trim() === '') return null
  try {
    const parsed: unknown = JSON.parse(text)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined
  } catch {
    return undefined
  }
}

/**
 * The API tool form. Headers are public names and values; a row left empty is dropped when the
 * tool is built. The arguments' schema is optional JSON.
 */
export function createApiToolFormSchema(
  messages: ToolFormMessages,
  isNameTaken: (name: string) => boolean,
) {
  return z.object({
    name: nameSchema(messages, isNameTaken),
    description: z.string().max(1000),
    method: z.enum(AGENT_HTTP_METHODS),
    url: addressSchema(messages.url),
    headers: z
      .array(
        z
          .object({ name: z.string().trim(), value: z.string().max(1000) })
          .refine(
            (header) =>
              (header.name === '' && header.value === '') ||
              (HEADER_NAME_PATTERN.test(header.name) && header.name.length <= 100),
            { path: ['name'], message: messages.header },
          ),
      )
      .max(20),
    inputSchema: z
      .string()
      .refine((text) => parseJsonObject(text) !== undefined, messages.inputSchema),
    connectionId: z.uuid().nullable(),
  })
}
export type ApiToolFormValues = z.input<ReturnType<typeof createApiToolFormSchema>>

export function emptyApiToolValues(): ApiToolFormValues {
  return {
    name: '',
    description: '',
    method: 'GET',
    url: '',
    headers: [],
    inputSchema: '',
    connectionId: null,
  }
}

export function apiToolToValues(tool: ApiTool): ApiToolFormValues {
  return {
    name: tool.name,
    description: tool.description,
    method: tool.method,
    url: tool.url,
    headers: tool.headers.map((header) => ({ ...header })),
    inputSchema: tool.inputSchema ? JSON.stringify(tool.inputSchema, null, 2) : '',
    connectionId: tool.connectionId,
  }
}

/** The tool the form describes: a new one starts on and read only; an edited one keeps both. */
export function toApiTool(values: ApiToolFormValues, existing: ApiTool | null): ApiTool {
  return {
    id: existing?.id ?? newToolId(),
    kind: 'api',
    name: values.name.trim(),
    description: values.description,
    permission: existing?.permission ?? 'read_only',
    enabled: existing?.enabled ?? true,
    method: values.method,
    url: values.url,
    headers: values.headers
      .filter((header) => header.name.trim() !== '' || header.value !== '')
      .map((header) => ({ name: header.name.trim(), value: header.value })),
    inputSchema: parseJsonObject(values.inputSchema) ?? null,
    connectionId: values.connectionId,
  }
}

/** The MCP server form: the actions found by discovery are kept beside it, not in it. */
export function createMcpToolFormSchema(
  messages: Pick<ToolFormMessages, 'name' | 'nameTaken' | 'url'>,
  isNameTaken: (name: string) => boolean,
) {
  return z.object({
    name: nameSchema(messages, isNameTaken),
    description: z.string().max(1000),
    serverUrl: addressSchema(messages.url),
    connectionId: z.uuid().nullable(),
  })
}
export type McpToolFormValues = z.input<ReturnType<typeof createMcpToolFormSchema>>

export function emptyMcpToolValues(): McpToolFormValues {
  return { name: '', description: '', serverUrl: '', connectionId: null }
}

export function mcpToolToValues(tool: McpTool): McpToolFormValues {
  return {
    name: tool.name,
    description: tool.description,
    serverUrl: tool.serverUrl,
    connectionId: tool.connectionId,
  }
}

export function toMcpTool(
  values: McpToolFormValues,
  actions: readonly AgentMcpAction[],
  existing: McpTool | null,
): McpTool {
  return {
    id: existing?.id ?? newToolId(),
    kind: 'mcp',
    name: values.name.trim(),
    description: values.description,
    permission: existing?.permission ?? 'read_only',
    enabled: existing?.enabled ?? true,
    serverUrl: values.serverUrl,
    connectionId: values.connectionId,
    discoveredActions: [...actions],
  }
}
