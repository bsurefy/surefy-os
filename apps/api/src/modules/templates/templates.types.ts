// SPDX-License-Identifier: AGPL-3.0-only
import type { ModelRefDto } from '@surefy/contracts'

import type { DbExecutor } from '@/core/database/index.js'

/** Who is asking: the organization and the person whose models decide the suggestion. */
export interface TemplatesContext {
  orgId: string
  userId: string | null
  teamIds: readonly string[]
  access: { permissions: readonly string[] }
}

/** The models the person may use (the agents module's model port). */
export interface TemplateModels {
  allowedFor(tx: DbExecutor, ctx: TemplatesContext): Promise<readonly ModelRefDto[]>
}

/** The bridges installed in the organization, by bridge key (`bridge`, V2). */
export interface TemplateBridges {
  installed(
    tx: DbExecutor,
    orgId: string,
    bridgeKeys: readonly string[],
  ): Promise<ReadonlyMap<string, { bridgeId: string }>>
}

/** No bridge module yet: nothing is installed, so bridge tools show "Not installed". */
export const NO_BRIDGES: TemplateBridges = { installed: () => Promise.resolve(new Map()) }
