// SPDX-License-Identifier: AGPL-3.0-only
// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { CLIENT_ERROR_CODES, ERROR_CODES } from '@surefy/contracts'

import { SHARED_NAMESPACES } from './i18n.constants'
import { loadSharedMessages, mergeMessages } from './loadSharedMessages'

describe('loadSharedMessages', () => {
  it('loads the shared namespaces of a locale', async () => {
    const messages = await loadSharedMessages('en')

    expect(Object.keys(messages).toSorted((a, b) => a.localeCompare(b))).toEqual(
      SHARED_NAMESPACES.toSorted((a, b) => a.localeCompare(b)),
    )
    expect(messages.common.close).toBe('Close')
    expect(messages.validation.required).toBe('This field is required.')
  })

  it('merges every errors/<domain>.json into one flat errors namespace', async () => {
    const { errors } = await loadSharedMessages('en')

    expect(errors[ERROR_CODES.ACCESS_FORBIDDEN]).toBe("You don't have permission to do this.")
    expect(errors[ERROR_CODES.TEAM_NAME_TAKEN]).toMatch(/already exists/)
    expect(errors[CLIENT_ERROR_CODES.NETWORK_ERROR]).toMatch(/connection/)
    expect(errors.fallback).toBe('Something went wrong. Please try again.')
  })

  it('throws for a locale without messages', async () => {
    await expect(loadSharedMessages('xx')).rejects.toThrow()
  })
})

describe('mergeMessages', () => {
  it('adds the app namespaces next to the shared ones', async () => {
    const shared = await loadSharedMessages('en')
    const merged = mergeMessages(shared, { agents: { title: 'Agents' } })

    expect(merged.agents.title).toBe('Agents')
    expect(merged.common.close).toBe('Close')
    expect(merged.errors.fallback).toBe(shared.errors.fallback)
  })

  it('refuses an app namespace with a shared name', async () => {
    const shared = await loadSharedMessages('en')

    expect(() => mergeMessages(shared, { common: { close: 'Shut' } })).toThrow(/"common" is shared/)
  })
})
