// SPDX-License-Identifier: AGPL-3.0-only
import type { CredentialImpactDto } from '@surefy/contracts'

type Translate = (key: string, values?: Record<string, string | number>) => string
type HasKey = (key: string) => boolean

/**
 * The lines of a T2 impact list: what depends on the key, server or model ("3 agents", "1 flow"),
 * the people who used it this month, and the model each dependent falls back to.
 * `t` is the `vault.impact` namespace.
 */
export function getImpactLines(
  t: Translate & { has: HasKey },
  impact: CredentialImpactDto,
  { includeFallback }: { includeFallback: boolean },
): string[] {
  const lines: string[] = []
  for (const dependent of impact.dependents) {
    if (dependent.count === 0) continue
    const key = `types.${dependent.type}`
    lines.push(
      t.has(key)
        ? t(key, { count: dependent.count })
        : t('types.other', { type: dependent.type, count: dependent.count }),
    )
  }
  if (impact.userCount > 0) lines.push(t('people', { count: impact.userCount }))
  if (includeFallback && impact.dependents.length > 0) {
    lines.push(
      impact.fallback ? t('fallback', { model: impact.fallback.displayName }) : t('noFallback'),
    )
  }
  return lines
}
