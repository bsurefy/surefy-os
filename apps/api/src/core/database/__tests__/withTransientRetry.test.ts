// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it, vi } from 'vitest'

import { ServiceUnavailableError } from '@/core/errors/index.js'

import {
  assertNoActiveScope,
  currentScope,
  isTransientError,
  withTransientRetry,
} from '../index.js'
import { runInScope } from '../scope.js'

const pgError = (code: string) => Object.assign(new Error(`sqlstate ${code}`), { code })

describe('withTransientRetry', () => {
  it('retries deadlocks and serialization failures, then returns the result', async () => {
    const run = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(pgError('40P01'))
      .mockRejectedValueOnce(pgError('40001'))
      .mockResolvedValue('done')
    await expect(withTransientRetry(run, { baseDelayMs: 0 })).resolves.toBe('done')
    expect(run).toHaveBeenCalledTimes(3)
  })

  it('gives up after the configured attempts with ServiceUnavailableError', async () => {
    const run = vi.fn<() => Promise<string>>().mockRejectedValue(pgError('40001'))
    const promise = withTransientRetry(run, { attempts: 2, baseDelayMs: 0 })
    await expect(promise).rejects.toBeInstanceOf(ServiceUnavailableError)
    await expect(promise).rejects.toMatchObject({ options: { meta: { sqlState: '40001' } } })
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('rethrows anything that is not transient without retrying', async () => {
    const run = vi.fn<() => Promise<string>>().mockRejectedValue(pgError('23505'))
    await expect(withTransientRetry(run, { baseDelayMs: 0 })).rejects.toMatchObject({
      code: '23505',
    })
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('recognizes only the transient SQLSTATEs', () => {
    expect(isTransientError(pgError('40P01'))).toBe(true)
    expect(isTransientError(pgError('23503'))).toBe(false)
    expect(isTransientError(new Error('plain'))).toBe(false)
    expect(isTransientError(null)).toBe(false)
  })
})

describe('database scope', () => {
  it('tracks the active scope and refuses to nest helpers', async () => {
    expect(currentScope()).toBeUndefined()
    await runInScope({ kind: 'tenant', orgId: 'org-a' }, async () => {
      expect(currentScope()).toEqual({ kind: 'tenant', orgId: 'org-a' })
      expect(() => {
        assertNoActiveScope()
      }).toThrow('nested database scope')
      await Promise.resolve()
    })
    expect(currentScope()).toBeUndefined()
    expect(() => {
      assertNoActiveScope()
    }).not.toThrow()
  })
})
