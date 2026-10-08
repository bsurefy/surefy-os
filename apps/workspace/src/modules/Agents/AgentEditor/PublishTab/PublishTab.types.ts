// SPDX-License-Identifier: AGPL-3.0-only
import type { AgentSaveStatus, AgentTabProps } from '../AgentEditor.types'

/** What the Publish tab needs on top of the shared tab props: the draft has to be saved to publish it. */
export interface PublishTabProps extends AgentTabProps {
  saveStatus: AgentSaveStatus
  /** Saves what is pending; the revision the draft is at then, or null when it could not be saved. */
  onFlush: () => Promise<number | null>
  /** A publish moved the draft to this revision. */
  onPublished: (revision: number) => void
  /** Someone else changed the agent first: the editor shows the conflict. */
  onConflict: (error: unknown) => Promise<void>
}
