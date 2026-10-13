// SPDX-License-Identifier: AGPL-3.0-only
import type { AgentDefinition, AgentDetailDto } from '@surefy/contracts'

/** How an edit changes the working copy of the definition. */
export type DefinitionUpdate = (definition: AgentDefinition) => AgentDefinition

/**
 * What every tab gets from the editor: the agent, the working copy of its draft and the way to
 * change it. A change shows at once and is saved by autosave; the tab never saves anything itself.
 */
export interface AgentTabProps {
  agent: AgentDetailDto
  definition: AgentDefinition
  onDefinitionChange: (update: DefinitionUpdate) => void
  /** Archived, or the person may not edit it: the tab shows its values and nothing to change. */
  isReadOnly: boolean
}

/** The agent's name and description are live metadata, saved apart from the draft. */
export interface AgentMetaValues {
  name: string
  description: string
}

/** How saving stands, as the header's status shows it. */
export type AgentSaveStatus =
  | { kind: 'saving' }
  | { kind: 'saved'; at: string }
  | { kind: 'error'; error: unknown }
  /**
   * Someone else changed the agent first; `remote` is the agent as it stands now and
   * `publishedVersion` the version they published, when the last change was a publish.
   */
  | { kind: 'conflict'; remote: AgentDetailDto; publishedVersion: number | null }
