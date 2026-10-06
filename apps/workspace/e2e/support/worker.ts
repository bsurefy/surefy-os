// SPDX-License-Identifier: AGPL-3.0-only
import { spawn } from 'node:child_process'

import { e2e, REPO_ROOT, workerEnv } from './env'

import type { ChildProcess } from 'node:child_process'

const START_TIMEOUT_MS = 90_000

const launch = (command: string, args: string[]) =>
  spawn(command, args, {
    cwd: REPO_ROOT,
    env: { ...process.env, ...workerEnv() },
    stdio: 'ignore',
    detached: true,
  })

/**
 * Starts the API's worker for a spec that needs a job to run (ingesting a document). The other
 * specs run without one, so what a job finishes stays in its first state there: audit entries
 * unsealed, exports preparing, usage not rolled up. The caller stops it in `afterAll`.
 */
export async function startWorker(): Promise<ChildProcess> {
  const worker = launch('pnpm', ['--filter', '@surefy/api', 'exec', 'tsx', 'src/worker.ts'])
  const health = `http://127.0.0.1:${String(e2e.workerPort)}/health/live`
  const deadline = Date.now() + START_TIMEOUT_MS
  for (;;) {
    if (worker.exitCode !== null)
      throw new Error(`The worker exited with ${String(worker.exitCode)}`)
    const alive = await fetch(health).then(
      (response) => response.ok,
      () => false,
    )
    if (alive) return worker
    if (Date.now() > deadline) {
      stopWorker(worker)
      throw new Error('The worker did not start in time')
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
}

/** Stops the worker and the processes it started (it runs in a group of its own). */
export function stopWorker(worker: ChildProcess): void {
  if (worker.pid !== undefined) process.kill(-worker.pid, 'SIGTERM')
}
