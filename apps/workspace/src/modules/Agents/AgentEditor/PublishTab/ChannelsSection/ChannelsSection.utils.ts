// SPDX-License-Identifier: AGPL-3.0-only
import { WIDGET_SCRIPT_PATH } from '@surefy/contracts'
import type { AgentChannelDto, AgentChannelRequest, AgentChannelType } from '@surefy/contracts'

/** The agent's channel of this type that is not turned off; null when there is none. */
export function currentChannelOf(
  channels: readonly AgentChannelDto[],
  type: AgentChannelType,
): AgentChannelDto | null {
  return (
    channels.find((channel) => channel.type === type && channel.status !== 'disconnected') ?? null
  )
}

/** The channel of this type chosen for the next publish, if any. */
export function requestOf<Type extends AgentChannelRequest['type']>(
  requests: readonly AgentChannelRequest[],
  type: Type,
): Extract<AgentChannelRequest, { type: Type }> | undefined {
  return requests.find(
    (request): request is Extract<AgentChannelRequest, { type: Type }> => request.type === type,
  )
}

/** The script tag a site owner pastes, with the token filled in (website-widget.md §1). */
export function buildEmbedSnippet(apiBaseUrl: string, token: string): string {
  return `<script src="${apiBaseUrl}${WIDGET_SCRIPT_PATH}" data-token="${token}" async></script>`
}

/**
 * The origins typed one per line (or separated by commas or spaces): each is reduced to its
 * origin (`https://acme.com/help` → `https://acme.com`), duplicates dropped. A value that is not an
 * http(s) address is returned in `invalid`.
 */
export function parseOrigins(text: string): { origins: string[]; invalid: string[] } {
  const origins: string[] = []
  const invalid: string[] = []
  for (const entry of text.split(/[\s,]+/).filter((part) => part !== '')) {
    const url = toUrl(entry)
    if (url === null || (url.protocol !== 'https:' && url.protocol !== 'http:')) {
      invalid.push(entry)
    } else if (!origins.includes(url.origin)) {
      origins.push(url.origin)
    }
  }
  return { origins, invalid }
}

function toUrl(text: string): URL | null {
  try {
    return new URL(text)
  } catch {
    return null
  }
}

/** Slack channel IDs typed one per line (or separated by commas or spaces). */
export function parseSlackChannelIds(text: string): string[] {
  return [...new Set(text.split(/[\s,]+/).filter((part) => part !== ''))]
}
