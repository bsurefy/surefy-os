// SPDX-License-Identifier: AGPL-3.0-only
import { toast as sonnerToast } from 'sonner'

import type { ToastOptions, UndoToastOptions } from './Toast.types'

// Catalog timing: success and info 4s, warning and error 6s, T1 Undo 6s; toasts with another
// action stay until dismissed. Timers pause on hover and focus (sonner).
const SHORT = 4000
const LONG = 6000

function withAction(duration: number, options: ToastOptions = {}) {
  const { action, ...rest } = options
  return {
    ...rest,
    duration: action ? Number.POSITIVE_INFINITY : duration,
    action: action && { label: action.label, onClick: action.onClick },
  }
}

/**
 * The only way modules show toasts; never import `sonner` directly. Text is translated and short,
 * and success toasts are only for results the page does not already show.
 */
export const toast = {
  success: (message: string, options?: ToastOptions) =>
    sonnerToast.success(message, withAction(SHORT, options)),
  info: (message: string, options?: ToastOptions) =>
    sonnerToast.info(message, withAction(SHORT, options)),
  warning: (message: string, options?: ToastOptions) =>
    sonnerToast.warning(message, withAction(LONG, options)),
  error: (message: string, options?: ToastOptions) =>
    sonnerToast.error(message, withAction(LONG, options)),
  /** T1 "Instant + Undo": "Moved · Undo" for 6 seconds. */
  undo: (message: string, { undoLabel, onUndo, onCommit, id }: UndoToastOptions) => {
    let isUndone = false
    return sonnerToast(message, {
      id,
      duration: LONG,
      action: {
        label: undoLabel,
        onClick: () => {
          isUndone = true
          onUndo()
        },
      },
      onAutoClose: () => {
        if (!isUndone) onCommit?.()
      },
      onDismiss: () => {
        if (!isUndone) onCommit?.()
      },
    })
  },
  /** Loading, then success or error, for work without a visible result. */
  promise: <T>(
    promise: Promise<T>,
    messages: {
      loading: string
      success: string | ((data: T) => string)
      error: string | ((error: unknown) => string)
    },
  ) => {
    sonnerToast.promise(promise, messages)
  },
  dismiss: (id?: string | number) => sonnerToast.dismiss(id),
}
