// SPDX-License-Identifier: AGPL-3.0-only
import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import {
  NOTIFICATION_TARGET_TYPES,
  NOTIFICATION_TYPES,
  type NotificationParams,
  type NotificationTargetType,
  type NotificationType,
} from '@surefy/contracts'

import { users } from './auth.tables.js'
import { organizationMembers, organizations } from './organizations.tables.js'
import { enumCheck } from '../checks.js'
import { id, orgId, timestamps } from '../columns.js'
import { tenantPolicy } from '../policies.js'

// Notification types are `<domain>.<event>`; enumCheck accepts no dot, so the list is checked here
// against the same rule before it goes into the CHECK.
const SAFE_TYPE = /^[a-z_]+\.[a-z_]+$/
const typeList = NOTIFICATION_TYPES.map((type) => {
  if (!SAFE_TYPE.test(type)) throw new Error(`unsafe notification type ${type}`)
  return `'${type}'`
}).join(', ')

/**
 * An in-app notification for one member of one organization (database/platform-and-jobs.md, §4).
 * Removing the member or the organization deletes their notifications by cascade.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: id(),
    organizationId: orgId(organizations),
    userId: uuid().notNull(),
    type: text().$type<NotificationType>().notNull(),
    params: jsonb()
      .$type<NotificationParams>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    targetType: text().$type<NotificationTargetType>(),
    targetId: uuid(), // polymorphic, no foreign key: a deleted target shows "No longer available"
    actorUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    dedupeKey: text(),
    readAt: timestamp({ withTimezone: true }),
    emailedAt: timestamp({ withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    unique('notifications_organization_id_id_key').on(t.organizationId, t.id),
    foreignKey({
      name: 'notifications_organization_id_user_id_fkey',
      columns: [t.organizationId, t.userId],
      foreignColumns: [organizationMembers.organizationId, organizationMembers.userId],
    }).onDelete('cascade'),
    index('notifications_user_feed_idx').on(t.organizationId, t.userId, t.createdAt.desc(), t.id),
    index('notifications_unread_idx')
      .on(t.organizationId, t.userId)
      .where(sql`${t.readAt} is null`),
    uniqueIndex('notifications_dedupe_key')
      .on(t.organizationId, t.userId, t.dedupeKey)
      .where(sql`${t.dedupeKey} is not null`),
    index('notifications_created_at_idx').on(t.createdAt),
    index('notifications_actor_user_id_idx').on(t.actorUserId),
    check('notifications_type_check', sql`${t.type} in (${sql.raw(typeList)})`),
    enumCheck('notifications_target_type_check', t.targetType, NOTIFICATION_TARGET_TYPES),
    tenantPolicy('notifications', t.organizationId),
  ],
)
