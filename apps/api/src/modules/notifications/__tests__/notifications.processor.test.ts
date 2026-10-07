// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it, vi } from 'vitest'

import { createCache } from '@/core/cache/index.js'
import { createQueues, registerJobs, type JobRuntime } from '@/core/queue/index.js'

import { RecordingMailProvider } from './notificationsTestKit.js'
import { newId } from '../../../../test/factories/index.js'
import { onFileTeardown } from '../../../../test/helpers/cleanup.js'
import { getTestDatabase } from '../../../../test/helpers/testDatabase.js'
import { createNotificationsModule } from '../notifications.module.js'

describe('sendEmail through the worker', () => {
  it('delivers a queued invitation email', async () => {
    const { db, config, logger } = getTestDatabase()
    const queues = createQueues(config, logger)
    const cache = createCache(config, logger)
    const mail = new RecordingMailProvider()
    const notifications = createNotificationsModule({ config, db, queues, mail })
    const runtime: JobRuntime = { config, logger, db, cache, queues, modules: { notifications } }
    const workers = registerJobs(runtime, notifications.jobs)
    onFileTeardown(async () => {
      await Promise.all(workers.map((worker) => worker.close()))
      await queues.close()
      await cache.quit()
    })

    await notifications.service.queueEmail({
      template: 'invitation',
      to: 'new@example.test',
      orgId: newId(),
      invitationId: newId(),
      url: 'https://app.example.test/invite/abc',
      organizationName: 'Acme',
      inviterName: 'Maya Chen',
    })

    await vi.waitFor(
      () => {
        expect(mail.sent).toHaveLength(1)
      },
      { timeout: 10_000 },
    )
    expect(mail.sent[0]).toMatchObject({
      to: 'new@example.test',
      subject: 'Maya Chen invited you to join Acme on SurefyOS',
    })
  })
})
