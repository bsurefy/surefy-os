// SPDX-License-Identifier: AGPL-3.0-only

/** The tabs of the agent editor, in order; each is a route (`/agents/<id>/<tab>`). */
export const AGENT_EDITOR_TABS = [
  'instructions',
  'model',
  'tools',
  'knowledge',
  'guard',
  'test',
  'publish',
  'versions',
  'runs',
] as const
export type AgentEditorTab = (typeof AGENT_EDITOR_TABS)[number]
export const DEFAULT_AGENT_EDITOR_TAB: AgentEditorTab = 'instructions'

/** Wait after the last edit before the draft is saved. */
export const AUTOSAVE_DELAY_MS = 1000

/** Where a draft that could not be saved waits on this device (per organization and agent). */
export const DEVICE_DRAFT_KEY_PREFIX = 'surefy:agent-draft'

/** Models listed in the pickers come from the first page of this size. */
export const MODEL_LOOKUP_LIMIT = 100

/** Knowledge bases listed in the picker come from the first page of this size. */
export const KNOWLEDGE_LOOKUP_LIMIT = 100

/** The model type an agent answers with. */
export const AGENT_MODEL_TYPE = 'chat'
