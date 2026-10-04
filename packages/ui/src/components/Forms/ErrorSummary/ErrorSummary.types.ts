// SPDX-License-Identifier: AGPL-3.0-only
export interface ErrorSummaryItem {
  /** Id of the field's control; the link moves focus there. */
  fieldId: string
  /** Translated message, the same one shown below the field. */
  message: string
}

export interface ErrorSummaryProps {
  /** "Fix 2 problems to continue". Translated text. */
  title: string
  errors: ErrorSummaryItem[]
  /** Errors that belong to no field (a conflict, a limit), listed without a link. */
  formErrors?: string[]
  className?: string
}
