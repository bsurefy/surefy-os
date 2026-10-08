// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createEmptyAgentDefinition } from '@surefy/contracts'

import {
  clearDeviceDraft,
  getAgentEditorTab,
  isAgentNameValid,
  readDeviceDraft,
  toSaveableDefinition,
  writeDeviceDraft,
} from './AgentEditor.utils'

const definition = createEmptyAgentDefinition('openai/gpt-4.1')

describe('getAgentEditorTab', () => {
  it('opens the named tab and falls back to Instructions', () => {
    expect(getAgentEditorTab('knowledge')).toBe('knowledge')
    expect(getAgentEditorTab('versions')).toBe('versions')
    expect(getAgentEditorTab(undefined)).toBe('instructions')
    expect(getAgentEditorTab('nonsense')).toBe('instructions')
  })
})

describe('toSaveableDefinition', () => {
  it('leaves out blank conversation starters and trims the rest', () => {
    const saveable = toSaveableDefinition({
      ...definition,
      conversationStarters: ['  Where is my order? ', '', '   '],
    })
    expect(saveable.conversationStarters).toEqual(['Where is my order?'])
  })

  it('turns an empty tone into none and trims a real one', () => {
    expect(toSaveableDefinition({ ...definition, tone: '  ' }).tone).toBeNull()
    expect(toSaveableDefinition({ ...definition, tone: ' Warm ' }).tone).toBe('Warm')
  })
})

describe('isAgentNameValid', () => {
  it('needs a name that is not just spaces', () => {
    expect(isAgentNameValid('Support triage')).toBe(true)
    expect(isAgentNameValid('   ')).toBe(false)
    expect(isAgentNameValid('')).toBe(false)
  })
})

describe('the draft kept on the device', () => {
  const store = new Map<string, string>()

  beforeEach(() => {
    store.clear()
    // this file runs without a browser, so storage is a map
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    })
  })

  it('comes back for the revision it was edited from', () => {
    writeDeviceDraft('org', 'agent', { baseRevision: 4, definition })
    expect(readDeviceDraft('org', 'agent', 4)).toEqual(definition)
  })

  it('is ignored once the draft moved on, or after it is cleared', () => {
    writeDeviceDraft('org', 'agent', { baseRevision: 4, definition })
    expect(readDeviceDraft('org', 'agent', 5)).toBeNull()
    clearDeviceDraft('org', 'agent')
    expect(readDeviceDraft('org', 'agent', 4)).toBeNull()
  })

  it('is ignored when what is stored is not a valid definition', () => {
    localStorage.setItem('surefy:agent-draft:org:agent', '{"baseRevision":4,"definition":{}}')
    expect(readDeviceDraft('org', 'agent', 4)).toBeNull()
    localStorage.setItem('surefy:agent-draft:org:agent', 'not json')
    expect(readDeviceDraft('org', 'agent', 4)).toBeNull()
  })
})
