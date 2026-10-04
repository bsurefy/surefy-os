// SPDX-License-Identifier: AGPL-3.0-only
export interface SaveBarLabels {
  /** "3 unsaved changes". */
  message: string
  discard: string
  save: string
}

export interface SaveBarProps {
  labels: SaveBarLabels
  /** Shown only when there are unsaved changes. */
  isDirty: boolean
  isSaving?: boolean
  onDiscard: () => void
  /** Id of the form the Save button submits. Without it, Save calls `onSave`. */
  formId?: string
  onSave?: () => void
  className?: string
}
