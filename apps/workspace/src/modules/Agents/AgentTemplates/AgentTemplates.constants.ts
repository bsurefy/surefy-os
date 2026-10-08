// SPDX-License-Identifier: AGPL-3.0-only
import type { AgentTemplateToolDto } from '@surefy/contracts'
import type { StatusTone } from '@surefy/ui/components/DataDisplay'

/** How a tool of a template is marked on its card. */
export const SETUP_TONE: Record<AgentTemplateToolDto['setup'], StatusTone | null> = {
  ready: null,
  needs_connection: 'warning',
  bridge_not_installed: 'warning',
}

/** Placeholder cards while the templates load. */
export const TEMPLATE_SKELETON_COUNT = 4
