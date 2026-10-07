// SPDX-License-Identifier: AGPL-3.0-only
import { definePermissions } from '../core/permissions.js'

export const AGENTS_PERMISSIONS = definePermissions({
  /** Talk to an agent shared with the person; also the scope an API key gives to published agents. */
  AGENTS_INVOKE: { key: 'agents:invoke', module: 'agents', minimumRole: 'user' },
  /** The Agents screens, templates and the agents the person may edit or see. Resource access is checked per agent. */
  AGENTS_READ: { key: 'agents:read', module: 'agents', minimumRole: 'builder' },
  AGENTS_CREATE: { key: 'agents:create', module: 'agents', minimumRole: 'builder' },
  /** Edit the draft, test, pause, archive and restore: on own agents and agents shared for editing. */
  AGENTS_EDIT: { key: 'agents:edit', module: 'agents', minimumRole: 'builder' },
  /** Publish to SurefyOS chat, roll back; external channels become a request for Builders. */
  AGENTS_PUBLISH: { key: 'agents:publish', module: 'agents', minimumRole: 'builder' },
  /** Delete own agents (all agents with `agents:manage-all`). */
  AGENTS_DELETE: { key: 'agents:delete', module: 'agents', minimumRole: 'builder' },
  /** Edit, delete and share every agent whoever owns it. */
  AGENTS_MANAGE_ALL: { key: 'agents:manage-all', module: 'agents', minimumRole: 'admin' },
  /** Publish to external channels (API, widget, Slack, WhatsApp) without an approval. */
  AGENTS_PUBLISH_EXTERNAL: {
    key: 'agents:publish-external',
    module: 'agents',
    minimumRole: 'admin',
  },
})
