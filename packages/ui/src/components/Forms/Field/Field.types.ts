// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactElement, ReactNode } from 'react'

export interface FieldProps {
  /** Visible label. Translated text. */
  label: ReactNode
  /** "(optional)": shown only for the rare optional field; required is the default. */
  optionalLabel?: string
  /** Help text, shown below the label. */
  description?: ReactNode
  /** Translated error; marks the control invalid and is shown below it. */
  error?: ReactNode
  /** Id of the control; generated when omitted. */
  id?: string
  /** Keeps the label for screen readers only, when the design truly shows none. */
  isLabelHidden?: boolean
  className?: string
  /**
   * One control that renders a focusable element with the props it gets (Input, Textarea,
   * SelectInput, Combobox, NumberInput…): it receives the id and aria props.
   */
  children: ReactElement
}

export interface FieldSetProps {
  /** Group label, rendered as the legend. */
  legend: ReactNode
  optionalLabel?: string
  description?: ReactNode
  error?: ReactNode
  className?: string
  /** A radio group, checkboxes or several related controls. */
  children: ReactNode
}

export interface FieldErrorProps {
  id?: string
  className?: string
  children: ReactNode
}
