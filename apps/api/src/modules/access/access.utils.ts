// SPDX-License-Identifier: AGPL-3.0-only
import {
  ACCESS_LIMIT_KEYS,
  FEATURES,
  MODEL_SOURCES,
  MODULES,
  PERMISSION_DEFINITIONS,
  type AccessExceedsParentDetail,
  type AccessLimitsDto,
  type AccessPolicy,
  type AccessReasonDto,
  type AccessReasonSource,
  type Feature,
  type ModelSource,
  type ModuleKey,
  type Permission,
  type PermissionDefinition,
} from '@surefy/contracts'

import type { EntitlementGrant } from './entitlements.types.js'

// The access chain (database/access-and-entitlements.md, "Effective access"): entitlement source
// → organization policy → team policies → role. Pure functions, unit-tested on their own.

const TOOL_KEYS = ['webSearch', 'pieces', 'mcp', 'apiTools'] as const
const TRAINING_KEYS = ['enabled', 'fineTuning'] as const
const PROVIDER_FLAGS = ['personalKeys', 'localModels'] as const
type ToolKey = (typeof TOOL_KEYS)[number]
type TrainingKey = (typeof TRAINING_KEYS)[number]
type ProviderFlag = (typeof PROVIDER_FLAGS)[number]

/** One level of the chain, fully resolved: what it allows and why the rest is off. */
export interface AccessLevel {
  modules: ModuleKey[]
  features: Feature[]
  limits: AccessLimitsDto
  /** Provider keys allowed; null = every provider. */
  providersAllowed: string[] | null
  providerFlags: Record<ProviderFlag, boolean>
  modelSources: ModelSource[]
  tools: Record<ToolKey, boolean>
  training: Record<TrainingKey, boolean>
  reasons: AccessReasonDto[]
}

/** Where a level's restrictions come from: the organization row, or one team's row. */
export type PolicyLevel = { source: 'organization' } | { source: 'team'; teamId: string }

const ALL_FEATURES = Object.values(FEATURES)

const allTrue = <K extends string>(keys: readonly K[]): Record<K, boolean> =>
  Object.fromEntries(keys.map((key) => [key, true])) as Record<K, boolean>

/** Keeps the canonical order of `order`, so outputs are stable. */
const ordered = <T>(order: readonly T[], keep: (value: T) => boolean): T[] => order.filter(keep)

const minLimit = (parent: number | null, own: number | undefined): number | null => {
  if (own === undefined) return parent
  return parent === null ? own : Math.min(parent, own)
}

const maxLimit = (values: readonly (number | null)[]): number | null =>
  values.includes(null) ? null : Math.max(...(values as number[]))

/** The top of the chain: what the entitlement source grants, and a reason for everything else. */
export function entitlementLevel(grant: EntitlementGrant, source: AccessReasonSource): AccessLevel {
  const modules = ordered(MODULES, (m) => grant.modules.includes(m))
  const features = ordered(ALL_FEATURES, (f) => grant.features.includes(f))
  return {
    modules,
    features,
    limits: { monthlySpendMicros: null, ...grant.limits },
    providersAllowed: null,
    providerFlags: allTrue(PROVIDER_FLAGS),
    modelSources: [...MODEL_SOURCES],
    tools: allTrue(TOOL_KEYS),
    training: allTrue(TRAINING_KEYS),
    reasons: [
      ...MODULES.filter((m) => !modules.includes(m)).map((m) => ({ key: `module:${m}`, source })),
      ...ALL_FEATURES.filter((f) => !features.includes(f)).map((f) => ({
        key: `feature:${f}`,
        source,
      })),
    ],
  }
}

const reasonOf = (key: string, level: PolicyLevel): AccessReasonDto =>
  level.source === 'team'
    ? { key, source: 'team', teamId: level.teamId }
    : { key, source: level.source }

const andFlags = <K extends string>(
  prefix: string,
  keys: readonly K[],
  parent: Record<K, boolean>,
  own: Partial<Record<K, boolean>> | undefined,
  level: PolicyLevel,
  reasons: AccessReasonDto[],
): Record<K, boolean> => {
  const result = { ...parent }
  for (const key of keys) {
    if (parent[key] && own?.[key] === false) {
      result[key] = false
      reasons.push(reasonOf(`${prefix}:${key}`, level))
    }
  }
  return result
}

/**
 * Down the chain: one level's own restrictions narrow its parent. Allow-lists intersect, limits
 * take the minimum, booleans AND, denials unite. A missing policy passes the parent through.
 */
export function narrow(
  parent: AccessLevel,
  policy: AccessPolicy | undefined,
  level: PolicyLevel,
): AccessLevel {
  if (policy === undefined) return { ...parent, reasons: [...parent.reasons] }
  const reasons = [...parent.reasons]
  const modules =
    policy.modules === undefined
      ? parent.modules
      : parent.modules.filter((m) => policy.modules?.includes(m))
  for (const m of parent.modules.filter((value) => !modules.includes(value))) {
    reasons.push(reasonOf(`module:${m}`, level))
  }
  const denied = policy.deniedFeatures ?? []
  const features = parent.features.filter((f) => !denied.includes(f))
  for (const f of parent.features.filter((value) => denied.includes(value))) {
    reasons.push(reasonOf(`feature:${f}`, level))
  }
  const limits = { ...parent.limits }
  for (const key of ACCESS_LIMIT_KEYS) {
    const own = policy.limits?.[key]
    limits[key] = minLimit(parent.limits[key], own)
    if (own !== undefined && limits[key] !== parent.limits[key]) {
      reasons.push(reasonOf(`limit:${key}`, level))
    }
  }
  const allowed = policy.providers?.allowed
  const providersAllowed =
    allowed === undefined
      ? parent.providersAllowed
      : (parent.providersAllowed?.filter((p) => allowed.includes(p)) ?? [...allowed])
  const ownSources = policy.providers?.modelSources
  const modelSources =
    ownSources === undefined
      ? parent.modelSources
      : parent.modelSources.filter((s) => ownSources.includes(s))
  return {
    modules,
    features,
    limits,
    providersAllowed,
    providerFlags: andFlags(
      'provider',
      PROVIDER_FLAGS,
      parent.providerFlags,
      policy.providers,
      level,
      reasons,
    ),
    modelSources,
    tools: andFlags('tool', TOOL_KEYS, parent.tools, policy.tools, level, reasons),
    training: andFlags('training', TRAINING_KEYS, parent.training, policy.training, level, reasons),
    reasons,
  }
}

const orFlags = <K extends string>(
  keys: readonly K[],
  levels: readonly AccessLevel[],
  pick: (level: AccessLevel) => Record<K, boolean>,
): Record<K, boolean> =>
  Object.fromEntries(keys.map((key) => [key, levels.some((l) => pick(l)[key])])) as Record<
    K,
    boolean
  >

/** Whether `key` (a reason key) is still off in `level`. */
export function isOff(level: AccessLevel, key: string): boolean {
  const [kind = '', name = ''] = key.split(':')
  switch (kind) {
    case 'module':
      return !level.modules.includes(name as ModuleKey)
    case 'feature':
      return !level.features.includes(name as Feature)
    case 'tool':
      return !level.tools[name as ToolKey]
    case 'training':
      return !level.training[name as TrainingKey]
    case 'provider':
      return !level.providerFlags[name as ProviderFlag]
    default:
      return true // limits stay explained by the levels that set them
  }
}

const reasonId = (reason: AccessReasonDto) =>
  `${reason.key}|${reason.source}|${reason.teamId ?? ''}`

/**
 * Across a person's teams, each already narrowed from the organization level: allow-lists unite,
 * limits take the maximum, booleans OR; something stays off only when every team turns it off.
 */
export function unionAcrossTeams(
  organization: AccessLevel,
  teams: readonly AccessLevel[],
): AccessLevel {
  if (teams.length === 0) return organization
  const union = {
    modules: ordered(MODULES, (m) => teams.some((t) => t.modules.includes(m))),
    features: ordered(ALL_FEATURES, (f) => teams.some((t) => t.features.includes(f))),
    limits: {
      monthlySpendMicros: organization.limits.monthlySpendMicros,
      ...(Object.fromEntries(
        ACCESS_LIMIT_KEYS.map((key) => [key, maxLimit(teams.map((t) => t.limits[key]))]),
      ) as Omit<AccessLimitsDto, 'monthlySpendMicros'>),
    },
    providersAllowed: teams.some((t) => t.providersAllowed === null)
      ? null
      : [...new Set(teams.flatMap((t) => t.providersAllowed ?? []))],
    providerFlags: orFlags(PROVIDER_FLAGS, teams, (t) => t.providerFlags),
    modelSources: ordered(MODEL_SOURCES, (s) => teams.some((t) => t.modelSources.includes(s))),
    tools: orFlags(TOOL_KEYS, teams, (t) => t.tools),
    training: orFlags(TRAINING_KEYS, teams, (t) => t.training),
    reasons: [] as AccessReasonDto[],
  }
  const seen = new Set<string>()
  for (const reason of teams.flatMap((t) => t.reasons)) {
    const id = reasonId(reason)
    if (seen.has(id) || !isOff(union, reason.key)) continue
    if (reason.key.startsWith('limit:') && reason.source === 'team') {
      const key = reason.key.slice('limit:'.length) as keyof AccessLimitsDto
      const teamLevel = teams.find((t) => t.reasons.some((r) => reasonId(r) === id))
      if (teamLevel?.limits[key] !== union.limits[key]) continue
    }
    seen.add(id)
    union.reasons.push(reason)
  }
  return union
}

const PERMISSION_GATES: ReadonlyMap<string, PermissionDefinition> = new Map(
  (Object.values(PERMISSION_DEFINITIONS) as PermissionDefinition[]).map((definition) => [
    definition.key,
    definition,
  ]),
)

/** The role's permissions whose module is on and whose feature, if any, is available. */
export function filterPermissions(
  permissions: readonly Permission[],
  modules: readonly ModuleKey[],
  features: readonly Feature[],
): Permission[] {
  return permissions.filter((permission) => {
    const gate = PERMISSION_GATES.get(permission)
    if (gate === undefined) return false
    if (gate.module !== null && !modules.includes(gate.module)) return false
    return gate.feature === undefined || features.includes(gate.feature)
  })
}

/**
 * Writes are validated against the parent: a policy may not allow what its parent level does not
 * have. Returns one detail per violation (`ACCESS_EXCEEDS_PARENT`).
 */
export function exceedsParent(
  parent: AccessLevel,
  policy: AccessPolicy,
  parentSource: AccessReasonSource,
): AccessExceedsParentDetail[] {
  const details: AccessExceedsParentDetail[] = []
  const add = (field: string, parentValue: unknown) => {
    details.push({ field, parentValue, parentSource })
  }
  if (policy.modules?.some((m) => !parent.modules.includes(m))) add('modules', parent.modules)
  const allowed = policy.providers?.allowed
  if (
    allowed !== undefined &&
    parent.providersAllowed !== null &&
    allowed.some((p) => !parent.providersAllowed?.includes(p))
  ) {
    add('providers.allowed', parent.providersAllowed)
  }
  if (policy.providers?.modelSources?.some((s) => !parent.modelSources.includes(s))) {
    add('providers.modelSources', parent.modelSources)
  }
  const flags: [string, boolean | undefined, boolean][] = [
    ...PROVIDER_FLAGS.map((k): [string, boolean | undefined, boolean] => [
      `providers.${k}`,
      policy.providers?.[k],
      parent.providerFlags[k],
    ]),
    ...TOOL_KEYS.map((k): [string, boolean | undefined, boolean] => [
      `tools.${k}`,
      policy.tools?.[k],
      parent.tools[k],
    ]),
    ...TRAINING_KEYS.map((k): [string, boolean | undefined, boolean] => [
      `training.${k}`,
      policy.training?.[k],
      parent.training[k],
    ]),
  ]
  for (const [field, own, parentValue] of flags) {
    if (own === true && !parentValue) add(field, parentValue)
  }
  for (const key of ACCESS_LIMIT_KEYS) {
    const own = policy.limits?.[key]
    const parentValue = parent.limits[key]
    if (own !== undefined && parentValue !== null && own > parentValue) {
      add(`limits.${key}`, parentValue)
    }
  }
  return details
}

/** Field-level differences of two policies, for the audit entry (`changes`). */
export function policyChanges(
  before: AccessPolicy,
  after: AccessPolicy,
): { field: string; from: unknown; to: unknown }[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  keys.delete('version')
  return [...keys]
    .sort((a, b) => a.localeCompare(b))
    .flatMap((field) => {
      const from = (before as Record<string, unknown>)[field] ?? null
      const to = (after as Record<string, unknown>)[field] ?? null
      return JSON.stringify(from) === JSON.stringify(to) ? [] : [{ field, from, to }]
    })
}
