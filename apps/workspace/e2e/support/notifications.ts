// SPDX-License-Identifier: AGPL-3.0-only
import { execFileSync } from 'node:child_process'

import type { NotificationType } from '@surefy/contracts'

import { e2e, REPO_ROOT } from './env'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const TYPE = /^[a-z_.]+$/

const run = (command: string, args: string[]) => {
  execFileSync(command, args, { cwd: REPO_ROOT, stdio: ['ignore', 'ignore', 'inherit'] })
}

const psql = (organizationId: string, userId: string, statement: string) => {
  if (![organizationId, userId].every((id) => UUID.test(id))) throw new Error('Expected two ids')
  run('docker', [
    'compose',
    '-f',
    `${REPO_ROOT}infra/docker/compose.dev.yml`,
    'exec',
    '-T',
    'postgres',
    'psql',
    '-v',
    'ON_ERROR_STOP=1',
    '-U',
    'postgres',
    '-d',
    e2e.database,
    '-c',
    statement,
  ])
}

/** Removes a person's notifications, so a spec starts from none whatever ran before it. */
export function clearNotifications(organizationId: string, userId: string): void {
  psql(
    organizationId,
    userId,
    `delete from notifications where organization_id = '${organizationId}' and user_id = '${userId}'`,
  )
}

/**
 * Puts notifications in front of a person, as the worker would when an export finishes or a source
 * fails: the worker does not run in the end-to-end stack. Written with `psql` as the database
 * owner, the way `prepareDatabase.ts` sets the database up; the API reads them as it reads any.
 */
export function seedNotifications(
  organizationId: string,
  userId: string,
  types: readonly NotificationType[],
): void {
  if (!types.every((type) => TYPE.test(type))) throw new Error('Expected notification types')
  const rows = types
    .map((type) => `('${organizationId}', '${userId}', '${type}', '{"version":1}'::jsonb)`)
    .join(', ')
  psql(
    organizationId,
    userId,
    `insert into notifications (organization_id, user_id, type, params) values ${rows}`,
  )
}
