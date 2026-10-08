// SPDX-License-Identifier: AGPL-3.0-only
import { agentDefinitionSchema, agentNameSchema } from '@surefy/contracts'
import type { AgentDefinition } from '@surefy/contracts'

import {
  AGENT_EDITOR_TABS,
  DEFAULT_AGENT_EDITOR_TAB,
  DEVICE_DRAFT_KEY_PREFIX,
} from './AgentEditor.constants'

import type { AgentEditorTab } from './AgentEditor.constants'

/** The open tab from the route; anything unknown opens Instructions. */
export function getAgentEditorTab(value: string | undefined): AgentEditorTab {
  return AGENT_EDITOR_TABS.find((tab) => tab === value) ?? DEFAULT_AGENT_EDITOR_TAB
}

/**
 * The working copy as the server accepts it: blank conversation starters (a row just added) are
 * left out and an empty tone is none. Everything else is saved as typed.
 */
export function toSaveableDefinition(definition: AgentDefinition): AgentDefinition {
  const tone = definition.tone?.trim() ?? ''
  return {
    ...definition,
    tone: tone === '' ? null : tone,
    conversationStarters: definition.conversationStarters
      .map((starter) => starter.trim())
      .filter((starter) => starter !== ''),
  }
}

export function isAgentNameValid(name: string): boolean {
  return agentNameSchema.safeParse(name).success
}

interface DeviceDraft {
  /** The revision the draft was edited from. */
  baseRevision: number
  definition: AgentDefinition
}

const deviceDraftKey = (orgId: string, agentId: string) =>
  `${DEVICE_DRAFT_KEY_PREFIX}:${orgId}:${agentId}`

/** Keeps a draft that could not be saved on this device. Storage may be blocked: then nothing is kept. */
export function writeDeviceDraft(orgId: string, agentId: string, draft: DeviceDraft): void {
  try {
    localStorage.setItem(deviceDraftKey(orgId, agentId), JSON.stringify(draft))
  } catch {
    // private window or blocked storage: the draft stays in the page only
  }
}

/** The draft kept on this device for exactly this revision, if it is still valid. */
export function readDeviceDraft(
  orgId: string,
  agentId: string,
  revision: number,
): AgentDefinition | null {
  try {
    const raw = localStorage.getItem(deviceDraftKey(orgId, agentId))
    if (!raw) return null
    const draft = JSON.parse(raw) as Partial<DeviceDraft>
    if (draft.baseRevision !== revision) return null
    const parsed = agentDefinitionSchema.safeParse(draft.definition)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function clearDeviceDraft(orgId: string, agentId: string): void {
  try {
    localStorage.removeItem(deviceDraftKey(orgId, agentId))
  } catch {
    // nothing to clear
  }
}
