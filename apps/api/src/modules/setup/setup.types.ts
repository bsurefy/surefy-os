// SPDX-License-Identifier: AGPL-3.0-only
import type { SetupChecklistItem } from '@surefy/contracts'

import type { TenantContext } from '@/types/context.js'

/**
 * First-run setup for the audit log: the new organization's first entry (`organization.created`,
 * actor the new Owner). The audit module provides it; until it is wired nothing is recorded.
 */
export interface SetupAudit {
  recordSetup(entry: { organizationId: string; userId: string; requestId: string }): Promise<void>
}

/** Whether the install has a GPU for local models (the ML service, once it reports one). */
export interface SetupGpuProbe {
  hasGpu(): Promise<boolean>
}

/**
 * One item of the home-screen setup checklist, contributed by the module that owns it (vault:
 * connect a model, knowledge: add documents, …). Items without a check are left out.
 */
export interface SetupChecklistCheck {
  key: SetupChecklistItem
  isDone(ctx: TenantContext): Promise<boolean>
}
