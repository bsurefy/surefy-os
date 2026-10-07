// SPDX-License-Identifier: AGPL-3.0-only
import type { NotificationDto, UserRefDto } from '@surefy/contracts'

import type { NotificationRow } from './notifications.repository.js'

export function toNotificationDto(
  row: NotificationRow,
  actors: ReadonlyMap<string, UserRefDto>,
): NotificationDto {
  return {
    id: row.id,
    type: row.type,
    params: row.params,
    target:
      row.targetType === null || row.targetId === null
        ? null
        : { type: row.targetType, id: row.targetId },
    actor: row.actorUserId === null ? null : (actors.get(row.actorUserId) ?? null),
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }
}
