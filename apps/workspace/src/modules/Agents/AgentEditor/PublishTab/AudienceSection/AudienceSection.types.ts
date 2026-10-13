// SPDX-License-Identifier: AGPL-3.0-only
import type { AgentAccessLevel } from '@surefy/contracts'

import type { AgentTabProps } from '../../AgentEditor.types'

export type AudienceSectionProps = Pick<AgentTabProps, 'agent' | 'isReadOnly'>

/** One row of "Who can use it": everyone, a team or a person. */
export interface AudienceRow {
  key: string
  kind: 'organization' | 'team' | 'user'
  label: string
  description?: string
  level: AgentAccessLevel
}
