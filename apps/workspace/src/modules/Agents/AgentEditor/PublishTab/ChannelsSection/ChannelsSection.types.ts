// SPDX-License-Identifier: AGPL-3.0-only
import type { AgentChannelDto } from '@surefy/contracts'

import type { AgentTabProps } from '../../AgentEditor.types'

export interface ChannelsSectionProps extends Pick<AgentTabProps, 'agent' | 'definition'> {
  /** Whether the person may change what is published. */
  canChange: boolean
  /** The API channel is requested with the next publish. */
  wantsApi: boolean
  onWantsApiChange: (wantsApi: boolean) => void
}

export type ChannelStatus = AgentChannelDto['status']
