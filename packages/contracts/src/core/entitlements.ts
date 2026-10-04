// SPDX-License-Identifier: AGPL-3.0-only
import { MODULES, type ModuleKey } from './modules.js'

import type { Feature } from '../features.js'

/** Numeric limits at the top of the access chain; null means unlimited. */
export interface EntitlementLimits {
  maxAgents: number | null
  maxFlows: number | null
  maxRunsPerMonth: number | null
  maxStorageBytes: number | null
  maxKnowledgeBases: number | null
}

/** What an entitlement source (Community, license, plan) grants before narrowing. */
export interface Entitlements {
  modules: readonly ModuleKey[]
  features: readonly Feature[]
  limits: EntitlementLimits
}

/** Community edition: every module, no Enterprise features, no numeric limits. */
export const COMMUNITY_ENTITLEMENTS = {
  modules: MODULES,
  features: [],
  limits: {
    maxAgents: null,
    maxFlows: null,
    maxRunsPerMonth: null,
    maxStorageBytes: null,
    maxKnowledgeBases: null,
  },
} as const satisfies Entitlements

/** Install-level limits of the Community edition: one organization per install (ADR 0016). */
export const COMMUNITY_INSTALL_LIMITS = { maxOrganizations: 1 } as const
