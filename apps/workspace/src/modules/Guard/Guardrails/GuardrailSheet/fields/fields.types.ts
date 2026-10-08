// SPDX-License-Identifier: AGPL-3.0-only
import type { GuardrailFormValues } from '../GuardrailSheet.schema'
import type { Control } from 'react-hook-form'

/** What every group of fields of the guardrail form takes. */
export interface FieldsProps {
  control: Control<GuardrailFormValues>
  /** The person cannot change this rule (no permission, or an Owner locked it). */
  isReadOnly: boolean
}
