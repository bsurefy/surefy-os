// SPDX-License-Identifier: AGPL-3.0-only
import { startContainers } from './containers.js'
import { migrateTemplate } from './migrateTemplate.js'

import type { TestProject } from 'vitest/node'

/**
 * Runs once per test run (vitest `globalSetup`): starts Postgres and Redis in containers,
 * bootstraps the roles the way the bundled Postgres does, migrates the template database as
 * `surefy_owner` and hands the coordinates to the test files. The containers are removed at the
 * end of the run (and by Testcontainers' reaper if the process dies).
 */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const containers = await startContainers()
  try {
    await migrateTemplate(containers.infrastructure.postgres)
  } catch (error) {
    await containers.stop()
    throw error
  }
  project.provide('infrastructure', containers.infrastructure)
  return () => containers.stop()
}
