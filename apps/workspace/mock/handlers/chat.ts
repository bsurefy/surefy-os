// SPDX-License-Identifier: AGPL-3.0-only
import { defineMockDomain } from '@surefy/web-core/testing/mock'

/**
 * Chats, folders, messages and the streaming answer (Chat). No handlers yet: the domain's screen task adds them here, one per endpoint, with a scenario
 * for every state of its screens. Until then its requests pass through to the real API.
 */
export const chatDomain = defineMockDomain('chat', [])
