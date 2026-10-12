// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import {
  BUILT_IN_CONNECTION_PROVIDERS,
  createKnowledgeConnectorSourceInputSchema,
  ERROR_CODES,
  KNOWLEDGE_AUDIT_ACTIONS,
  KNOWLEDGE_CONNECTOR_CONNECTION_PROVIDERS,
  KNOWLEDGE_CONNECTOR_FOLDERS_MAX,
  KNOWLEDGE_ERROR_CODES,
  knowledgeConnectorItemsDtoSchema,
  knowledgeConnectorOf,
  listKnowledgeConnectorItemsQuerySchema,
  updateKnowledgeSourceInputSchema,
} from '../index.js'

const id = '0190a5c4-0000-7000-8000-000000000001'
const folder = { externalId: '1AbC', name: 'Finance' }

describe('knowledge connectors', () => {
  it('maps every connector to a built-in knowledge connection provider', () => {
    const knowledgeProviders = BUILT_IN_CONNECTION_PROVIDERS.filter(
      (provider) => provider.kind === 'knowledge_connector',
    ).map((provider) => provider.key)
    expect(Object.values(KNOWLEDGE_CONNECTOR_CONNECTION_PROVIDERS)).toEqual(
      expect.arrayContaining([...knowledgeProviders]),
    )
    expect(knowledgeProviders).toHaveLength(
      Object.keys(KNOWLEDGE_CONNECTOR_CONNECTION_PROVIDERS).length,
    )
    expect(knowledgeConnectorOf('google-drive')).toBe('google_drive')
    expect(knowledgeConnectorOf('notion')).toBe('notion')
    expect(knowledgeConnectorOf('slack')).toBeNull()
  })

  it('browses one level of a connection at a time', () => {
    const query = listKnowledgeConnectorItemsQuerySchema.parse({ connectionId: id })
    expect(query.limit).toBe(50)
    expect(query.parentId).toBeUndefined()
    expect(listKnowledgeConnectorItemsQuerySchema.safeParse({}).success).toBe(false)
    expect(
      knowledgeConnectorItemsDtoSchema.safeParse({
        provider: 'notion',
        items: [
          {
            externalId: 'page-1',
            name: 'Handbook',
            kind: 'page',
            hasChildren: true,
            path: null,
            inBase: false,
          },
        ],
        nextCursor: 'token',
      }).success,
    ).toBe(true)
  })

  it('adds a connector source with at least one folder, synced daily by default', () => {
    expect(
      createKnowledgeConnectorSourceInputSchema.parse({ connectionId: id, folders: [folder] }),
    ).toEqual({ connectionId: id, folders: [folder], syncEvery: 'daily' })
    expect(
      createKnowledgeConnectorSourceInputSchema.safeParse({ connectionId: id, folders: [] })
        .success,
    ).toBe(false)
    const many = Array.from({ length: KNOWLEDGE_CONNECTOR_FOLDERS_MAX + 1 }, () => folder)
    expect(
      createKnowledgeConnectorSourceInputSchema.safeParse({ connectionId: id, folders: many })
        .success,
    ).toBe(false)
  })

  it('changes the folders and schedule but never the provider', () => {
    expect(
      updateKnowledgeSourceInputSchema.parse({ connector: { syncEvery: 'hourly' } }).connector,
    ).toEqual({ syncEvery: 'hourly' })
    expect(updateKnowledgeSourceInputSchema.safeParse({ connector: { folders: [] } }).success).toBe(
      false,
    )
    expect(
      updateKnowledgeSourceInputSchema.parse({ connector: { provider: 'notion' } }).connector,
    ).toEqual({})
  })

  it('registers the codes and names the audit actions <area>.<verb>', () => {
    for (const code of Object.values(KNOWLEDGE_ERROR_CODES)) expect(ERROR_CODES[code]).toBe(code)
    expect(KNOWLEDGE_AUDIT_ACTIONS.KNOWLEDGE_SOURCE_UPDATED).toBe('knowledge_source.updated')
  })
})
