// SPDX-License-Identifier: AGPL-3.0-only
import { createLoader, parseAsString, parseAsStringLiteral } from 'nuqs/server'

import { AUDIT_ACTOR_TYPES, AUDIT_OUTCOMES } from '@surefy/contracts'

import { AUDIT_DATE_RANGES } from './AuditLog.constants'

/**
 * `?q=&actor=&person=&action=&object=&result=&range=&entry=`: the log's filters and the open entry
 * survive a reload and can be shared.
 */
export const auditLogSearchParams = {
  q: parseAsString.withDefault(''),
  actor: parseAsStringLiteral(AUDIT_ACTOR_TYPES),
  person: parseAsString,
  action: parseAsString,
  object: parseAsString,
  result: parseAsStringLiteral(AUDIT_OUTCOMES),
  range: parseAsStringLiteral(AUDIT_DATE_RANGES).withDefault('all'),
  entry: parseAsString,
}

export const loadAuditLogSearchParams = createLoader(auditLogSearchParams)
