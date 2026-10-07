// SPDX-License-Identifier: AGPL-3.0-only
import { useTranslations } from 'next-intl'

import type { AuditEntryDto } from '@surefy/contracts'

import { getActionMessageKey, getActorFallbackKey } from './AuditLog.utils'

/**
 * How an entry reads on screen. Actions and object types written by later modules may have no
 * label yet; they show as written (`ticket.replied`).
 */
export function useAuditLabels() {
  const t = useTranslations('guard.auditLog')
  const labelOr = (key: string, raw: string) => (t.has(key) ? t(key) : raw)

  return {
    actor: (entry: AuditEntryDto) => entry.actor.name ?? t(getActorFallbackKey(entry.actor)),
    actorType: (entry: AuditEntryDto) => t(getActorFallbackKey(entry.actor)),
    action: (action: string) => labelOr(getActionMessageKey(action), action),
    objectType: (targetType: string) => labelOr(`objectTypes.${targetType}`, targetType),
    /** "Team · Support"; the type alone when the entry is about the organization or the object is gone. */
    object: (entry: AuditEntryDto) => {
      const type = labelOr(`objectTypes.${entry.targetType}`, entry.targetType)
      return entry.targetLabel ? t('objectWithLabel', { type, label: entry.targetLabel }) : type
    },
    outcome: (entry: AuditEntryDto) => t(`outcomes.${entry.outcome}`),
    via: (entry: AuditEntryDto) => t(`vias.${entry.via}`),
  }
}
