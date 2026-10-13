// SPDX-License-Identifier: MIT
import type {
  ErrorResponse,
  SendWidgetMessageInput,
  WidgetConfigDto,
  WidgetMessage,
  WidgetSourceEvent,
  WidgetStreamEvent,
  WidgetStreamEventName,
} from '@surefy/contracts'

// The public widget endpoint (`@surefy/contracts` agents/widget.ts). Only its types are imported:
// they are erased at build, so the MIT bundle holds no AGPL code (ADR 0022). The runtime values
// below repeat the contract's; a test keeps them equal.

export type {
  ErrorResponse,
  SendWidgetMessageInput,
  WidgetConfigDto,
  WidgetMessage,
  WidgetSourceEvent,
  WidgetStreamEvent,
  WidgetStreamEventName,
}

export const TOKEN_HEADER = 'x-surefy-widget-token'
export const CONVERSATION_HEADER = 'x-surefy-widget-conversation'
export const SCRIPT_PATH = '/widget/v1/widget.js'
export const MESSAGES_MAX = 20
export const STREAM_EVENTS: readonly WidgetStreamEventName[] = [
  'run',
  'text-delta',
  'source',
  'waiting-approval',
  'done',
  'error',
]

export const API_PREFIX = '/api/v1/widget'
