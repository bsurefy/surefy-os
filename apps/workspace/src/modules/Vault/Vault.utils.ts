// SPDX-License-Identifier: AGPL-3.0-only
import { KEY_EXPIRY_WARNING_DAYS } from '@surefy/contracts'
import type {
  CredentialDto,
  CredentialStatus,
  FallbackEntryDto,
  ModelAccessRuleDto,
  ProviderCardStatus,
  SetModelAccessInput,
  UsableModelDto,
} from '@surefy/contracts'
import type { StatusTone } from '@surefy/ui/components/DataDisplay'

import { ACCESS_SUBJECT, DEFAULT_VAULT_TAB, PROVIDER_NAMES, VAULT_TABS } from './Vault.constants'

import type { VaultTab } from './Vault.constants'

const DAY_MS = 86_400_000

export function getVaultTab(value: string | undefined): VaultTab {
  return VAULT_TABS.find((tab) => tab === value) ?? DEFAULT_VAULT_TAB
}

export function getProviderName(providerKey: string): string {
  return PROVIDER_NAMES[providerKey] ?? providerKey
}

/** The provider chip's status words use hyphens where the contract uses underscores. */
export function getChipStatus(
  status: ProviderCardStatus,
): 'connected' | 'rate-limited' | 'expiring' | 'error' | 'not-connected' {
  switch (status) {
    case 'rate_limited':
      return 'rate-limited'
    case 'not_connected':
      return 'not-connected'
    default:
      return status
  }
}

/** Whole days from `now` to `iso`, rounded up; negative once passed. */
export function getDaysUntil(iso: string, now: number): number {
  return Math.ceil((new Date(iso).getTime() - now) / DAY_MS)
}

/** Days left on a key that expires within the warning window; null otherwise. */
export function getExpiringDays(
  credential: Pick<CredentialDto, 'expiresAt' | 'status'>,
  now: number,
): number | null {
  if (credential.status !== 'active' || !credential.expiresAt) return null
  const days = getDaysUntil(credential.expiresAt, now)
  return days <= KEY_EXPIRY_WARNING_DAYS ? days : null
}

export function getStatusTone(status: CredentialStatus): StatusTone {
  switch (status) {
    case 'active':
      return 'success'
    case 'rate_limited':
    case 'expired':
      return 'warning'
    case 'error':
      return 'destructive'
    default:
      return 'neutral'
  }
}

/** `••••a1B2`: the secret is never returned, only its last four characters. */
export function getMaskedValue(secretLast4: string | null): string {
  return secretLast4 ? `••••${secretLast4}` : '—'
}

export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return [...items]
  }
  const next = [...items]
  const [moved] = next.splice(from, 1)
  if (moved !== undefined) next.splice(to, 0, moved)
  return next
}

/** The entries that serve requests, in order: "Requests go to GPT-4.1, then llama3.1:70b". */
export function getFallbackChain(entries: readonly FallbackEntryDto[]): FallbackEntryDto[] {
  return entries.filter((entry) => entry.state === 'ready')
}

export type ModelGroup = 'local' | 'provider' | 'platform'

/** "On your server", "Your API keys", and on Cloud "Included with credits" (the picker's groups). */
export function groupModels(
  models: readonly UsableModelDto[],
): Record<ModelGroup, UsableModelDto[]> {
  const groups: Record<ModelGroup, UsableModelDto[]> = { local: [], provider: [], platform: [] }
  for (const model of models) {
    if (model.source === 'platform') groups.platform.push(model)
    else if (model.source === 'provider') groups.provider.push(model)
    else groups.local.push(model)
  }
  return groups
}

export interface AccessSelection {
  organization: boolean
  teamIds: string[]
  userIds: string[]
}

/** The picker's values for a model's rules. */
export function toAccessValues(rules: readonly ModelAccessRuleDto[]): string[] {
  return rules.flatMap((rule) => {
    if (rule.subjectType === 'organization') return [ACCESS_SUBJECT.ORGANIZATION]
    if (rule.subjectType === 'team' && rule.team) {
      return [`${ACCESS_SUBJECT.TEAM_PREFIX}${rule.team.id}`]
    }
    if (rule.subjectType === 'user' && rule.user) {
      return [`${ACCESS_SUBJECT.USER_PREFIX}${rule.user.id}`]
    }
    return []
  })
}

export function fromAccessValues(values: readonly string[]): SetModelAccessInput['rules'] {
  return values.flatMap((value): SetModelAccessInput['rules'] => {
    if (value === ACCESS_SUBJECT.ORGANIZATION) return [{ subjectType: 'organization' }]
    if (value.startsWith(ACCESS_SUBJECT.TEAM_PREFIX)) {
      return [{ subjectType: 'team', teamId: value.slice(ACCESS_SUBJECT.TEAM_PREFIX.length) }]
    }
    if (value.startsWith(ACCESS_SUBJECT.USER_PREFIX)) {
      return [{ subjectType: 'user', userId: value.slice(ACCESS_SUBJECT.USER_PREFIX.length) }]
    }
    return []
  })
}

/** Whether a rule set grants the model to a team, directly or through "everyone". */
export function grantsTeam(rules: readonly ModelAccessRuleDto[], teamId: string): boolean {
  return rules.some((rule) => rule.subjectType === 'organization' || rule.team?.id === teamId)
}
