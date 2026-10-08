// SPDX-License-Identifier: AGPL-3.0-only
import type { AgentImpactDto } from '@surefy/contracts'

export interface ImpactLine {
  key: 'everyone' | 'teams' | 'people' | 'channels' | 'approvals'
  count: number
}

/**
 * What a pause or an archive affects, as lines of the dialog: who can use the agent, the live
 * channels that stop answering and the approvals still waiting. Lines with nothing in them are
 * left out.
 */
export function getImpactLines(impact: AgentImpactDto): ImpactLine[] {
  const { sharedWith } = impact
  const lines: ImpactLine[] = []
  if (sharedWith.everyone) lines.push({ key: 'everyone', count: 0 })
  else {
    if (sharedWith.teamCount > 0) lines.push({ key: 'teams', count: sharedWith.teamCount })
    if (sharedWith.userCount > 0) lines.push({ key: 'people', count: sharedWith.userCount })
  }
  if (impact.activeChannels.length > 0) {
    lines.push({ key: 'channels', count: impact.activeChannels.length })
  }
  if (impact.pendingApprovals > 0) lines.push({ key: 'approvals', count: impact.pendingApprovals })
  return lines
}
