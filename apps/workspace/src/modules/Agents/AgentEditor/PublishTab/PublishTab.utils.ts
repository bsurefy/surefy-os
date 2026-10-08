// SPDX-License-Identifier: AGPL-3.0-only
import type { AgentSaveStatus } from '../AgentEditor.types'

export type BlockedReason =
  'noRights' | 'conflict' | 'saveFailed' | 'readinessUnknown' | 'notReady' | 'nothingToPublish'

interface PublishState {
  /** The person may publish this agent. */
  canChange: boolean
  saveKind: AgentSaveStatus['kind']
  /** The readiness could not be read. */
  isReadinessUnknown: boolean
  /** Blocking readiness items that fail. */
  blockingCount: number
  hasNothingToPublish: boolean
}

/** Why Publish is disabled, the first thing in the way; null when it can be pressed. */
export function getBlockedReason(state: PublishState): BlockedReason | null {
  if (!state.canChange) return 'noRights'
  if (state.saveKind === 'conflict') return 'conflict'
  if (state.saveKind === 'error') return 'saveFailed'
  if (state.isReadinessUnknown) return 'readinessUnknown'
  if (state.blockingCount > 0) return 'notReady'
  if (state.hasNothingToPublish) return 'nothingToPublish'
  return null
}
