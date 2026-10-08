// SPDX-License-Identifier: AGPL-3.0-only
import { SCHEMA_CACHE_MAX, SCHEMA_CACHE_TTL_MS } from './agentTools.constants.js'

import type { McpToolInfo } from '@/integrations/mcp/index.js'

interface Entry {
  tools: ReadonlyMap<string, McpToolInfo>
  expiresAt: number
}

/**
 * What an MCP server declared about its tools, kept a few minutes in this process. A definition
 * stores only names and switches, so the arguments come from the server; the cache spares a
 * handshake at the start of every run. Nothing secret is kept: the key names the connection.
 */
export class SchemaCache {
  private readonly entries = new Map<string, Entry>()

  constructor(private readonly now: () => number = Date.now) {}

  static key(orgId: string, connectionId: string | null, serverUrl: string): string {
    return `${orgId}|${connectionId ?? '-'}|${serverUrl}`
  }

  get(key: string): ReadonlyMap<string, McpToolInfo> | undefined {
    const entry = this.entries.get(key)
    if (entry === undefined) return undefined
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key)
      return undefined
    }
    return entry.tools
  }

  set(key: string, tools: readonly McpToolInfo[]): void {
    this.entries.delete(key)
    this.entries.set(key, {
      tools: new Map(tools.map((tool) => [tool.name, tool])),
      expiresAt: this.now() + SCHEMA_CACHE_TTL_MS,
    })
    // oldest first: a Map iterates in insertion order
    for (const oldest of this.entries.keys()) {
      if (this.entries.size <= SCHEMA_CACHE_MAX) break
      this.entries.delete(oldest)
    }
  }
}
