// SPDX-License-Identifier: AGPL-3.0-only
import type { AuditAction } from '@surefy/contracts'

import type { MailProvider, SmtpMailOptions } from '@/integrations/mail/index.js'
import type { ActorContext } from '@/types/context.js'

/**
 * One install change for the audit log (organizations-and-members.md, §10): the audit module
 * writes it to the acting administrator's last organization with `target_type = 'install'`.
 */
export interface InstallAuditEntry {
  action: Extract<
    AuditAction,
    'install.settings_updated' | 'install.admin_added' | 'install.admin_removed'
  >
  actor: ActorContext
  /** The administrator added or removed; null for settings. */
  targetUserId: string | null
  /** Names of the changed fields, never their values (no secrets in the log). */
  changes?: readonly string[]
}

/**
 * Where install changes are audited. The audit module provides it; until it is wired the
 * changes are not recorded (`INSTALL_DEFAULTS.audit`).
 */
export interface InstallAudit {
  recordInstallChange(entry: InstallAuditEntry): Promise<void>
}

/** Builds the one-off SMTP transport of "Send test email" (a fake in tests). */
export type SmtpTestMailerFactory = (options: SmtpMailOptions) => MailProvider

/** Signs organization logo URLs (the organizations module). */
export interface InstallOrganizationLogos {
  logoUrl(key: string | null): Promise<string | null>
}
