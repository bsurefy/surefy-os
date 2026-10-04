// SPDX-License-Identifier: AGPL-3.0-only
import { notifications } from '@/database/tables/index.js'

import { defineTableFactory, newId } from '../../../../test/factories/index.js'

import type { MailMessage, MailProvider } from '@/integrations/mail/index.js'

/** Keeps every email instead of sending it; `failWith` makes the next sends throw. */
export class RecordingMailProvider implements MailProvider {
  readonly driver = 'console' as const
  readonly sent: MailMessage[] = []
  failWith: Error | undefined

  send(message: MailMessage): Promise<void> {
    if (this.failWith !== undefined) return Promise.reject(this.failWith)
    this.sent.push(message)
    return Promise.resolve()
  }

  close(): Promise<void> {
    return Promise.resolve()
  }
}

export const notificationFactory = defineTableFactory(notifications, (seq) => ({
  organizationId: newId(),
  userId: newId(),
  type: 'knowledge_source.ready' as const,
  params: { version: 1 as const, sourceName: `Source ${seq}` },
  targetType: 'knowledge_source' as const,
  targetId: newId(),
}))
