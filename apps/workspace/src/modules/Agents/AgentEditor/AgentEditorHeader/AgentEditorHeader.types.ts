// SPDX-License-Identifier: AGPL-3.0-only
import type { AgentStatus } from '@surefy/contracts'

import type { AgentSaveStatus } from '../AgentEditor.types'

export interface AgentEditorHeaderProps {
  name: string
  status: AgentStatus
  /** The live version's number; null before the first publish. */
  liveVersion: number | null
  /** How far the working copy is from the live version; null while that is not known. */
  changeCount: number | null
  /** Whether the live version differs from the draft when the count is not known yet. */
  hasUnpublishedChanges: boolean
  /** Null in a read-only editor: nothing is saved. */
  saveStatus: AgentSaveStatus | null
  /** Test and Publish are for people who may edit the agent. */
  canAct: boolean
  agentsHref: string
  testHref: string
  publishHref: string
  tabs: { value: string; label: string; href: string }[]
  activeTab: string
  onRetry: () => void
}
