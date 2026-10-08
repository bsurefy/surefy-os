// SPDX-License-Identifier: AGPL-3.0-only
import type { AgentDefinitionChange } from '@surefy/contracts'

export interface AgentChangeListProps {
  changes: readonly AgentDefinitionChange[]
}

/** One line of the list: the words, and the editor tab the change belongs to. */
export interface DescribedChange {
  text: string
  section: AgentDefinitionChange['section']
  kind: AgentDefinitionChange['kind']
}
