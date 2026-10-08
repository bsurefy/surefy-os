// SPDX-License-Identifier: AGPL-3.0-only
import type { AgentTemplateDto } from '@surefy/contracts'

export interface TemplateCardProps {
  template: AgentTemplateDto
  /** The person may install bridges; others are told to ask an admin. */
  canInstallBridges: boolean
  isCreating: boolean
  /** Another card is creating; this one waits. */
  isDisabled: boolean
  onUse: (template: AgentTemplateDto) => void
}
