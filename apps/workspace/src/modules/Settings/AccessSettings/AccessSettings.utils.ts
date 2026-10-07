// SPDX-License-Identifier: AGPL-3.0-only
import { ORG_ROLES, PERMISSION_DEFINITIONS, roleAtLeast } from '@surefy/contracts'
import type { AccessReasonDto, ModuleKey, OrgRole } from '@surefy/contracts'

export interface CapabilityRow {
  /** `members:invite`, the permission key. */
  key: string
  /** The module that must be on for the permission to count; null = always on. */
  module: ModuleKey | null
  allowedByRole: Record<OrgRole, boolean>
}

export interface CapabilityGroup {
  /** The resource before the colon: `members`, `data-control`. */
  group: string
  rows: CapabilityRow[]
}

/**
 * The capability matrix: every permission with the roles that hold it by default, grouped by
 * resource in the order the contracts declare them.
 */
export function buildCapabilityMatrix(
  definitions: readonly {
    key: string
    module: ModuleKey | null
    minimumRole: OrgRole
  }[] = Object.values(PERMISSION_DEFINITIONS),
): CapabilityGroup[] {
  const groups = new Map<string, CapabilityRow[]>()
  for (const definition of definitions) {
    const [group = definition.key] = definition.key.split(':')
    const row: CapabilityRow = {
      key: definition.key,
      module: definition.module,
      allowedByRole: Object.fromEntries(
        ORG_ROLES.map((role) => [role, roleAtLeast(role, definition.minimumRole)]),
      ) as Record<OrgRole, boolean>,
    }
    groups.set(group, [...(groups.get(group) ?? []), row])
  }
  return [...groups].map(([group, rows]) => ({ group, rows }))
}

export interface ParsedReason {
  /** `module`, `feature`, `permission`, `limit`, `tool` or `training`. */
  type: string
  /** What it names: `train`, `sso`, `agents:publish`, `maxAgents`. */
  name: string
}

/** Splits a reason key (`module:train`, `permission:agents:publish`) into its type and name. */
export function parseReasonKey(key: string): ParsedReason {
  const separator = key.indexOf(':')
  if (separator === -1) return { type: key, name: '' }
  return { type: key.slice(0, separator), name: key.slice(separator + 1) }
}

/** The reason that switched a module off, if any. */
export function findModuleReason(
  reasons: AccessReasonDto[],
  module: ModuleKey,
): AccessReasonDto | undefined {
  return reasons.find((reason) => reason.key === `module:${module}`)
}

export type ReasonTarget = { section: 'members' } | { section: 'teams'; teamId: string } | null

/** Where a reason can be changed: the role in Members, a team's rules in Teams; nothing for plans. */
export function getReasonTarget(reason: AccessReasonDto): ReasonTarget {
  if (reason.source === 'role') return { section: 'members' }
  if (reason.source === 'team' && reason.teamId) return { section: 'teams', teamId: reason.teamId }
  return null
}

const MICROS_PER_UNIT = 1_000_000
const BYTES_PER_MEGABYTE = 1_000_000

/** A limit as the screen shows it: money in whole currency units, storage in megabytes. */
export function toLimitDisplayValue(key: string, value: number): number {
  if (key === 'monthlySpendMicros') return Math.round(value / MICROS_PER_UNIT)
  if (key === 'maxStorageBytes') return Math.round(value / BYTES_PER_MEGABYTE)
  return value
}
