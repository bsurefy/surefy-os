// SPDX-License-Identifier: AGPL-3.0-only
import type { AuditService } from './audit.service.js'
import type { Logger } from '@/core/logger/index.js'
import type { ActorContext } from '@/types/context.js'

/** An install change as the install module reports it (`InstallAuditEntry`). */
export interface InstallChange {
  action: 'install.settings_updated' | 'install.admin_added' | 'install.admin_removed'
  actor: ActorContext
  targetUserId: string | null
  /** Names of the changed fields, never their values. */
  changes?: readonly string[]
}

/**
 * The install module's audit hook: each change is written to the administrator's last
 * organization. An administrator without an active organization leaves a log line instead.
 */
export function createInstallAudit(audit: AuditService, logger: Logger) {
  return {
    async recordInstallChange(change: InstallChange): Promise<void> {
      const written = await audit.recordInLastOrganization(change.actor, {
        action: change.action,
        target:
          change.targetUserId === null
            ? { type: 'install', id: null }
            : { type: 'user', id: change.targetUserId },
        metadata:
          change.changes === undefined
            ? {}
            : { changes: change.changes.map((field) => ({ field, from: null, to: null })) },
      })
      if (!written) {
        logger.warn({ action: change.action }, 'install change not audited: no active organization')
      }
    },
  }
}
