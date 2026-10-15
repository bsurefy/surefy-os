// SPDX-License-Identifier: AGPL-3.0-only
import type {
  InsightsApprovalsDto,
  ModelPickerSource,
  TeamRefDto,
  UsageSourceModule,
  UserRefDto,
} from '@surefy/contracts'

import type { DbExecutor } from '@/core/database/index.js'
import type { TenantContext } from '@/types/context.js'

/** What the services need from the request: the verified organization, who reads and their access. */
export type UsageContext = Pick<
  TenantContext,
  'orgId' | 'userId' | 'via' | 'requestId' | 'teamIds' | 'access'
>

/** Team names (teams module). */
export interface UsageTeams {
  findRefsInTx(tx: DbExecutor, orgId: string, teamIds: readonly string[]): Promise<TeamRefDto[]>
}

/** People's display data (auth module). */
export interface UsageUserRefs {
  findUserRefs(userIds: readonly string[]): Promise<ReadonlyMap<string, UserRefDto>>
}

/** The Vault models behind model keys, with their prices (vault module). */
export interface UsageModelRow {
  modelKey: string
  displayName: string
  providerKey: string
  source: string
  inputPricePerMtokMicros: number | null
  outputPricePerMtokMicros: number | null
}

export interface UsageModels {
  findByKeys(tx: DbExecutor, orgId: string, modelKeys: readonly string[]): Promise<UsageModelRow[]>
}

/** Who reads, for the agents they may edit: `all` holds `agents:manage-all`. */
export interface UsageViewer {
  userId: string | null
  teamIds: readonly string[]
  all: boolean
}

/** Agents as Insights reads them (agents module). */
export interface UsageAgents {
  /** The agents the viewer may edit: a Builder's Insights are narrowed to them. */
  editableIds(tx: DbExecutor, orgId: string, viewer: UsageViewer): Promise<string[]>
  /** Names by id, deleted agents included; purged ones are absent. */
  names(tx: DbExecutor, orgId: string, ids: readonly string[]): Promise<ReadonlyMap<string, string>>
}

/** Approval numbers for a range (approvals module). */
export interface UsageApprovals {
  insightsStats(
    tx: DbExecutor,
    orgId: string,
    range: { from: Date; to: Date; agentIds?: readonly string[] },
  ): Promise<InsightsApprovalsDto>
}

/** Which module a gateway caller meters as; `system` calls are model routing. */
export const SOURCE_MODULE_OF_CALLER: Record<
  'chat' | 'agent' | 'flow' | 'knowledge' | 'system',
  UsageSourceModule
> = {
  chat: 'chat',
  agent: 'agent',
  flow: 'flow',
  knowledge: 'knowledge',
  system: 'routing',
}

export const asPickerSource = (source: string): ModelPickerSource => source as ModelPickerSource
