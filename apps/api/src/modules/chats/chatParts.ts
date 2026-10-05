// SPDX-License-Identifier: AGPL-3.0-only
import { CHAT_PARTS_VERSION } from '@surefy/contracts'
import type { ChatMessagePart, ChatMessageParts, SourcePart } from '@surefy/contracts'

import type { UIMessageChunk } from 'ai'

interface OpenPart {
  index: number
  startedAt: number
}

/**
 * Builds the `ChatMessageParts` of an assistant answer from the chunks of its UI message stream:
 * text, reasoning and tool calls as separate parts, web sources as numbered `source` parts after
 * the knowledge ones. Reasoning and tool output stay out of the answer text.
 */
export class PartsBuilder {
  private readonly parts: ChatMessagePart[]
  private readonly text = new Map<string, OpenPart>()
  private readonly reasoning = new Map<string, OpenPart>()
  private readonly tools = new Map<string, number>()
  private nextSourceIndex: number

  constructor(
    initial: readonly ChatMessagePart[],
    private readonly now: () => number = Date.now,
  ) {
    this.parts = [...initial]
    this.nextSourceIndex =
      this.parts.reduce(
        (max, part) => (part.type === 'source' ? Math.max(max, part.index) : max),
        0,
      ) + 1
  }

  apply(chunk: UIMessageChunk): void {
    switch (chunk.type) {
      case 'text-start':
        this.text.set(chunk.id, {
          index: this.parts.push({ type: 'text', text: '' }) - 1,
          startedAt: this.now(),
        })
        break
      case 'text-delta': {
        const open = this.text.get(chunk.id)
        const part = open === undefined ? undefined : this.parts[open.index]
        if (part?.type === 'text') part.text += chunk.delta
        break
      }
      case 'reasoning-start':
        this.reasoning.set(chunk.id, {
          index: this.parts.push({ type: 'reasoning', text: '' }) - 1,
          startedAt: this.now(),
        })
        break
      case 'reasoning-delta': {
        const open = this.reasoning.get(chunk.id)
        const part = open === undefined ? undefined : this.parts[open.index]
        if (part?.type === 'reasoning') part.text += chunk.delta
        break
      }
      case 'reasoning-end': {
        const open = this.reasoning.get(chunk.id)
        const part = open === undefined ? undefined : this.parts[open.index]
        if (open !== undefined && part?.type === 'reasoning') {
          part.durationMs = Math.max(0, this.now() - open.startedAt)
        }
        break
      }
      case 'tool-input-available':
        this.tools.set(
          chunk.toolCallId,
          this.parts.push({
            type: 'tool',
            toolCallId: chunk.toolCallId,
            toolName: chunk.toolName,
            state: 'pending',
            input: toJson(chunk.input),
          }) - 1,
        )
        break
      case 'tool-output-available':
        this.settleTool(chunk.toolCallId, (part) => {
          part.state = 'done'
          part.output = toJson(chunk.output)
        })
        break
      case 'tool-output-error':
      case 'tool-input-error':
        this.settleTool(chunk.toolCallId, (part) => {
          part.state = 'error'
          part.errorCode = 'TOOL_FAILED'
        })
        break
      case 'source-url':
        this.parts.push({
          type: 'source',
          index: this.nextSourceIndex++,
          kind: 'web',
          url: chunk.url,
          title: chunk.title ?? chunk.url,
          snippet: '',
        })
        break
      default:
        break
    }
  }

  /** Adds a part the service produced (the stopped marker, a note). */
  push(part: ChatMessagePart): void {
    this.parts.push(part)
  }

  get sources(): SourcePart[] {
    return this.parts.filter((part): part is SourcePart => part.type === 'source')
  }

  /** Whether any text was produced (what separates a failed answer from an interrupted one). */
  get hasText(): boolean {
    return this.parts.some((part) => part.type === 'text' && part.text !== '')
  }

  snapshot(): ChatMessageParts {
    return { version: CHAT_PARTS_VERSION, parts: structuredClone(this.parts) }
  }

  private settleTool(
    toolCallId: string,
    change: (part: Extract<ChatMessagePart, { type: 'tool' }>) => void,
  ): void {
    const index = this.tools.get(toolCallId)
    const part = index === undefined ? undefined : this.parts[index]
    if (part?.type === 'tool') change(part)
  }
}

type Json = Extract<ChatMessagePart, { type: 'tool' }>['input']

/** Tool input and output are JSON the model produced; anything else becomes null. */
function toJson(value: unknown): Json {
  try {
    return JSON.parse(JSON.stringify(value ?? null)) as Json
  } catch {
    return null
  }
}
