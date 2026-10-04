// SPDX-License-Identifier: AGPL-3.0-only
import { pgTable, text, uuid } from 'drizzle-orm/pg-core'

import { id } from '@/database/columns.js'
import { tenantPolicy } from '@/database/policies.js'

// Throwaway tables that exist only in a test database: the harness proves itself on them until
// the module tables land. They are built with the real column and policy builders.

/** A `tenant`-family table, as every tenant-owned table will be (FORCE RLS is added on install). */
export const probeItems = pgTable(
  'probe_items',
  {
    id: id(),
    organizationId: uuid().notNull(),
    name: text().notNull(),
  },
  (table) => [tenantPolicy('probe_items', table.organizationId)],
)

/** The mistake the guards must catch: a tenant table with no policy at all. */
export const probeLeaks = pgTable('probe_leaks', {
  id: id(),
  organizationId: uuid().notNull(),
  name: text().notNull(),
})

export const probeSchema = { probeItems, probeLeaks }
