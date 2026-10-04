// SPDX-License-Identifier: AGPL-3.0-only
import type { AbstractIntlMessages } from 'next-intl'

/**
 * The workspace's own namespaces for a locale, one per module, merged after the shared ones:
 * `messages/<locale>/index.ts` (the merge file) imports each module's namespace.
 */
export async function loadAppMessages(locale: string): Promise<AbstractIntlMessages> {
  const loaded = (await import(`../../../messages/${locale}/index.ts`)) as {
    default: AbstractIntlMessages
  }
  return loaded.default
}
