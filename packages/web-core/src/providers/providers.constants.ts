// SPDX-License-Identifier: AGPL-3.0-only
import { DEFAULT_UI_LABELS } from '@surefy/ui/lib/labels'
import type { UiLabels } from '@surefy/ui/lib/labels'

/** next-themes with the `class` strategy: `.dark` on `<html>`; "system" follows the OS. */
export const THEMES = ['light', 'dark', 'system'] as const
export type Theme = (typeof THEMES)[number]
export const DEFAULT_THEME: Theme = 'system'
/** Browser storage key of the chosen theme (next-themes). */
export const THEME_STORAGE_KEY = 'surefy-theme'

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value)
}

/** The built-in labels of `@surefy/ui`, filled from the `common` namespace under the same keys. */
export const UI_LABEL_KEYS = Object.keys(DEFAULT_UI_LABELS) as (keyof UiLabels)[]
