// SPDX-License-Identifier: AGPL-3.0-only
import { NotFoundError, UnauthorizedError } from '@/core/errors/index.js'
import { notifications } from '@/database/tables/index.js'
import { ERROR_CODES } from '@surefy/contracts'

import { defineTableFactory, newId } from '../../../../test/factories/index.js'

import type { NotificationsContext, NotificationsRouteAccess } from '../notifications.types.js'
import type { MailMessage, MailProvider } from '@/integrations/mail/index.js'
import type { FastifyRequest } from 'fastify'

/** Stand-ins for the session and access plugins: who calls, as request headers. */
const TEST_ORG_HEADER = 'x-test-org'
const TEST_USER_HEADER = 'x-test-user'
/** `x-test-user: api-key` acts as an API key of the organization (no person). */
export const API_KEY_USER = 'api-key'

export const asMember = (orgId: string, userId: string) => ({
  [TEST_ORG_HEADER]: orgId,
  [TEST_USER_HEADER]: userId,
})

const header = (request: FastifyRequest, name: string): string | undefined => {
  const value = request.headers[name]
  return typeof value === 'string' ? value : undefined
}

/**
 * The access layer as the access plugin behaves for these routes: 401 without a caller, 404
 * `ORGANIZATION_NOT_FOUND` when the caller is not in `:orgId`, then the verified context.
 */
export function createTestAccess(): NotificationsRouteAccess {
  const contexts = new WeakMap<FastifyRequest, NotificationsContext>()
  return {
    authorize: () => (request) => {
      const orgId = header(request, TEST_ORG_HEADER)
      const userId = header(request, TEST_USER_HEADER)
      if (orgId === undefined || userId === undefined) throw new UnauthorizedError()
      const params = request.params as { orgId?: string }
      if (params.orgId !== orgId) {
        throw new NotFoundError(ERROR_CODES.ORGANIZATION_NOT_FOUND, 'Organization not found')
      }
      contexts.set(request, { orgId, userId: userId === API_KEY_USER ? null : userId })
      return Promise.resolve()
    },
    context: (request) => {
      const context = contexts.get(request)
      if (context === undefined) throw new Error('route without the test access guard')
      return context
    },
  }
}

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
