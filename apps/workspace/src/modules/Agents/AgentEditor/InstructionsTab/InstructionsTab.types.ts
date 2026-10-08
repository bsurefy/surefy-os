// SPDX-License-Identifier: AGPL-3.0-only
import type { AgentMetaValues, AgentTabProps } from '../AgentEditor.types'

export interface InstructionsTabProps extends AgentTabProps {
  /** Name and description, as typed; they are live metadata and save apart from the draft. */
  meta: AgentMetaValues
  isNameValid: boolean
  onMetaChange: (patch: Partial<AgentMetaValues>) => void
}
