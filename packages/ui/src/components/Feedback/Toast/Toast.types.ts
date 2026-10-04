// SPDX-License-Identifier: AGPL-3.0-only
export interface ToastAction {
  /** "Retry", "Copy details". Translated text. */
  label: string
  onClick: () => void
}

export interface ToastOptions {
  /** A second line. */
  description?: string
  /** A toast with an action stays until dismissed. */
  action?: ToastAction
  /** Replaces an earlier toast with the same id instead of stacking. */
  id?: string
}

export interface UndoToastOptions {
  /** "Undo". */
  undoLabel: string
  onUndo: () => void
  /**
   * Deferred commit: called when the toast closes without Undo. Use it only for actions that
   * cannot be reversed afterwards; reversible actions run at once and Undo reverses them.
   */
  onCommit?: () => void
  id?: string
}

export interface ToasterProps {
  /** The app's current theme; the provider passes it. */
  theme?: 'light' | 'dark' | 'system'
}
