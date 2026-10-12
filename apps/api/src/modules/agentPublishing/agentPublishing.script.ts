// SPDX-License-Identifier: AGPL-3.0-only
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

export interface WidgetScript {
  body: string
  /** A strong ETag of the file. */
  etag: string
}

/** `@surefy/widget`'s build output, found through its package exports. */
const readBuiltScript = (): Promise<string> =>
  readFile(createRequire(import.meta.url).resolve('@surefy/widget/widget.js'), 'utf8')

/**
 * The widget script, read once: null when `@surefy/widget` was not built (a development checkout
 * that never ran its build), so the route answers 404 instead of failing.
 */
export function widgetScriptLoader(
  read: () => Promise<string> = readBuiltScript,
): () => Promise<WidgetScript | null> {
  let loaded: Promise<WidgetScript | null> | undefined
  return () => {
    loaded ??= read().then(
      (body) => ({
        body,
        etag: `"${createHash('sha256').update(body).digest('base64url').slice(0, 27)}"`,
      }),
      () => {
        loaded = undefined
        return null
      },
    )
    return loaded
  }
}
