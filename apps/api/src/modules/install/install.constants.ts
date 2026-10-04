// SPDX-License-Identifier: AGPL-3.0-only
import { SmtpMailProvider } from '@/integrations/mail/index.js'

import type { InstallAudit, SmtpTestMailerFactory } from './install.types.js'

/**
 * Install settings are read on every sign-up and `/me`, so they are cached in memory this long.
 * A change made in this process invalidates the copy at once; other processes see it after this.
 */
export const INSTALL_SETTINGS_CACHE_MS = 30_000

/** Defaults until the owning modules are wired: no audit log, a real SMTP transport. */
export const INSTALL_DEFAULTS = {
  audit: { recordInstallChange: () => Promise.resolve() } satisfies InstallAudit,
  smtpTestMailer: ((options) => new SmtpMailProvider(options)) satisfies SmtpTestMailerFactory,
} as const
