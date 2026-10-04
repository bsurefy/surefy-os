// SPDX-License-Identifier: AGPL-3.0-only
import {
  NOTIFICATION_DEFAULTS,
  NOTIFICATION_TYPES,
  type MemberPreferencesDto,
  type NotificationChannels,
  type NotificationType,
  type UpdateMemberPreferencesInput,
} from '@surefy/contracts'

import { MemberPersonRequiredError } from '../members.errors.js'

import type {
  MemberPreferencesRepository,
  MemberPreferencesRow,
} from './memberPreferences.repository.js'
import type { MembersContext } from '../members.types.js'
import type { Database } from '@/core/database/index.js'

type Stored = MemberPreferencesRow['preferences']

/** A type's channels: the member's choice over the default; required emails stay on. */
const channelsOf = (stored: Stored | undefined, type: NotificationType): NotificationChannels => {
  const defaults = NOTIFICATION_DEFAULTS[type]
  const chosen = stored?.notifications?.[type]
  return {
    inApp: chosen?.inApp ?? defaults.inApp,
    email: defaults.emailRequired ? true : (chosen?.email ?? defaults.email),
  }
}

const toDto = (row: MemberPreferencesRow | undefined): MemberPreferencesDto => ({
  defaultModelKey: row?.defaultModelKey ?? null,
  notifications: Object.fromEntries(
    NOTIFICATION_TYPES.map((type) => [type, channelsOf(row?.preferences, type)]),
  ) as MemberPreferencesDto['notifications'],
  checklistDismissed: row?.preferences.checklistDismissed ?? false,
  tableDensity: row?.preferences.tableDensity ?? 'comfortable',
})

const personOf = (ctx: MembersContext): string => {
  if (ctx.userId === null) throw new MemberPersonRequiredError()
  return ctx.userId
}

/** A member's preferences inside one organization (organizations-and-members.md, §8). */
export class MemberPreferencesService {
  constructor(
    private readonly deps: {
      db: Database
      memberPreferencesRepository: MemberPreferencesRepository
    },
  ) {}

  async get(ctx: MembersContext): Promise<MemberPreferencesDto> {
    const userId = personOf(ctx)
    const row = await this.deps.db.tenant(ctx.orgId, (tx) =>
      this.deps.memberPreferencesRepository.find(tx, ctx.orgId, userId),
    )
    return toDto(row)
  }

  /** Only the fields the request names change; notification channels merge per type. */
  async update(
    ctx: MembersContext,
    input: UpdateMemberPreferencesInput,
  ): Promise<MemberPreferencesDto> {
    const userId = personOf(ctx)
    const repository = this.deps.memberPreferencesRepository
    const row = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const current = await repository.find(tx, ctx.orgId, userId)
      const stored: Stored = current?.preferences ?? { version: 1 }
      const notifications = { ...stored.notifications }
      for (const [type, channels] of Object.entries(input.notifications ?? {})) {
        const key = type as NotificationType
        notifications[key] = { ...channelsOf(stored, key), ...notifications[key], ...channels }
      }
      return repository.upsert(tx, ctx.orgId, userId, {
        defaultModelKey:
          input.defaultModelKey === undefined
            ? (current?.defaultModelKey ?? null)
            : input.defaultModelKey,
        preferences: {
          ...stored,
          version: 1,
          notifications,
          ...(input.checklistDismissed === undefined
            ? {}
            : { checklistDismissed: input.checklistDismissed }),
          ...(input.tableDensity === undefined ? {} : { tableDensity: input.tableDensity }),
        },
      })
    })
    return toDto(row)
  }

  /**
   * Transaction-free read for producers: the channels a member wants for one notification type
   * (the notification email copy reads it).
   */
  async channelsFor(
    orgId: string,
    userId: string,
    type: NotificationType,
  ): Promise<NotificationChannels> {
    const row = await this.deps.db.tenant(orgId, (tx) =>
      this.deps.memberPreferencesRepository.find(tx, orgId, userId),
    )
    return channelsOf(row?.preferences, type)
  }
}
