// SPDX-License-Identifier: MIT
import {
  API_PREFIX,
  CONVERSATION_HEADER,
  STREAM_EVENTS,
  TOKEN_HEADER,
  type ErrorResponse,
  type SendWidgetMessageInput,
  type WidgetConfigDto,
  type WidgetStreamEvent,
} from './protocol.js'
import { readEventStream } from './sse.js'

/** A request that failed before or while streaming; `code` is an API error code. */
export class WidgetApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    /** From `Retry-After` on `RATE_LIMITED`. */
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(code)
    this.name = 'WidgetApiError'
  }
}

/** Codes the widget makes up for failures that never reached the API. */
export const NETWORK_ERROR = 'NETWORK_ERROR'
export const STREAM_INTERRUPTED = 'STREAM_INTERRUPTED'

type OnEvent = (event: WidgetStreamEvent) => void

const isStreamEvent = (name: string): name is WidgetStreamEvent['event'] =>
  (STREAM_EVENTS as readonly string[]).includes(name)

async function errorOf(response: Response): Promise<WidgetApiError> {
  let code = `HTTP_${String(response.status)}`
  try {
    const body = (await response.json()) as Partial<ErrorResponse>
    if (typeof body.error?.code === 'string') code = body.error.code
  } catch {
    // Not the error envelope (a proxy page): keep the status code.
  }
  const retryAfter = Number(response.headers.get('retry-after'))
  return new WidgetApiError(
    code,
    response.status,
    Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
  )
}

/** Talks to the public widget endpoint with the channel token; never sends cookies. */
export class WidgetApi {
  private readonly base: string

  constructor(
    apiUrl: string,
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
  ) {
    let root = apiUrl
    while (root.endsWith('/')) root = root.slice(0, -1)
    this.base = `${root}${API_PREFIX}`
  }

  async getConfig(signal?: AbortSignal): Promise<WidgetConfigDto> {
    const response = await this.request('/config', { method: 'GET', signal })
    return ((await response.json()) as { data: WidgetConfigDto }).data
  }

  /** Sends the conversation and streams the answer; resolves when the stream ends. */
  async send(input: SendWidgetMessageInput, onEvent: OnEvent, signal?: AbortSignal): Promise<void> {
    const response = await this.request('/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify(input),
      signal,
    })
    await this.stream(response, onEvent)
  }

  /** Reattaches to a run that waited for a person, from the last event received. */
  async reattach(
    runId: string,
    conversationId: string,
    lastEventId: string | null,
    onEvent: OnEvent,
    signal?: AbortSignal,
  ): Promise<void> {
    const headers: Record<string, string> = {
      accept: 'text/event-stream',
      [CONVERSATION_HEADER]: conversationId,
    }
    if (lastEventId !== null) headers['last-event-id'] = lastEventId
    const response = await this.request(`/runs/${encodeURIComponent(runId)}/events`, {
      method: 'GET',
      headers,
      signal,
    })
    await this.stream(response, onEvent)
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    let response: Response
    try {
      response = await this.fetchImpl(`${this.base}${path}`, {
        ...init,
        credentials: 'omit',
        headers: { ...(init.headers as Record<string, string>), [TOKEN_HEADER]: this.token },
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error
      throw new WidgetApiError(NETWORK_ERROR, 0)
    }
    if (!response.ok) throw await errorOf(response)
    return response
  }

  private async stream(response: Response, onEvent: OnEvent): Promise<void> {
    if (response.body === null) throw new WidgetApiError(STREAM_INTERRUPTED, response.status)
    try {
      await readEventStream(response.body, (raw) => {
        if (!isStreamEvent(raw.event)) return
        const data: unknown = JSON.parse(raw.data)
        onEvent({ event: raw.event, id: raw.id, data } as WidgetStreamEvent)
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error
      throw new WidgetApiError(STREAM_INTERRUPTED, response.status)
    }
  }
}
