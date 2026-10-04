// SPDX-License-Identifier: AGPL-3.0-only
import type { AbstractIntlMessages } from 'next-intl'

/**
 * The workspace's own namespaces for a locale, one per module, merged after the shared ones. The
 * module skeleton adds `messages/<locale>/index.ts` (the merge file), and this loader then returns
 * `import(\`../../../messages/${locale}/index.ts\`)`. Until then the workspace has no namespaces.
 */
export function loadAppMessages(): Promise<AbstractIntlMessages> {
  return Promise.resolve({})
}
