// SPDX-License-Identifier: AGPL-3.0-only
import { parseAsString } from 'nuqs'

/**
 * `?agent=<id>` on a new chat: the chat will talk to that agent ("Agents shared with you" and the
 * picker's Agents tab link here). The first answer moves the chat to its own address.
 */
export const chatThreadSearchParams = {
  agent: parseAsString,
}
