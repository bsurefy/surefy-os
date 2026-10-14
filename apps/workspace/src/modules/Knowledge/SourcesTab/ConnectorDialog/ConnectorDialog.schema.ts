// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { KNOWLEDGE_CONNECTOR_FOLDERS_MAX, KNOWLEDGE_CONNECTOR_SYNC_EVERY } from '@surefy/contracts'

/** What the form says when a value is not acceptable; translated by the caller. */
export interface ConnectorFormMessages {
  connection: string
  folders: string
  tooManyFolders: string
}

/** A connector source: the account, the folders or pages it syncs, how often, and its name. */
export function createConnectorFormSchema(messages: ConnectorFormMessages) {
  return z.object({
    connectionId: z
      .string()
      .nullable()
      .refine((id) => id !== null, messages.connection),
    folders: z
      .array(z.object({ externalId: z.string(), name: z.string() }))
      .min(1, messages.folders)
      .max(KNOWLEDGE_CONNECTOR_FOLDERS_MAX, messages.tooManyFolders),
    syncEvery: z.enum(KNOWLEDGE_CONNECTOR_SYNC_EVERY),
    name: z.string().trim().max(200),
  })
}
export type ConnectorFormValues = z.input<ReturnType<typeof createConnectorFormSchema>>
export type ConnectorFolder = ConnectorFormValues['folders'][number]
