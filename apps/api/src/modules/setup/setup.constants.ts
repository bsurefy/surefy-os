// SPDX-License-Identifier: AGPL-3.0-only
import type { SetupAudit, SetupGpuProbe } from './setup.types.js'

/** `POST /setup` runs under this transaction-scoped advisory lock (organizations-and-members.md, §9). */
export const SETUP_LOCK = 'surefy:setup'

/** The object the Welcome step writes and deletes to check storage. */
export const STORAGE_CHECK_KEY = 'install/setup-check'

/** Stable codes of the Welcome step's server check; the setup screen translates them. */
export const SETUP_CHECK_CODES = {
  DATABASE_UNREACHABLE: 'DATABASE_UNREACHABLE',
  STORAGE_UNAVAILABLE: 'STORAGE_UNAVAILABLE',
  EMAIL_NOT_CONFIGURED: 'EMAIL_NOT_CONFIGURED',
  GPU_NOT_DETECTED: 'GPU_NOT_DETECTED',
} as const

/** Defaults until the owning modules are wired: no audit log, no GPU detection. */
export const SETUP_DEFAULTS = {
  audit: { recordSetup: () => Promise.resolve() } satisfies SetupAudit,
  gpu: { hasGpu: () => Promise.resolve(false) } satisfies SetupGpuProbe,
} as const
