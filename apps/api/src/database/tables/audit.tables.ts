// SPDX-License-Identifier: AGPL-3.0-only
import { bigint, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core'

import { organizations } from './organizations.tables.js'
import { timestamps } from '../columns.js'
import { bytea } from '../columnTypes.js'
import { tenantPolicy } from '../policies.js'

// The audit chain heads (database/usage-budgets-and-audit.md, §5). The partitioned `audit_logs`
// parent is custom SQL; its typed definition is in partitioned/audit.tables.ts.

/** The last sealed position of each organization's chain. Written only by `audit_seal`. */
export const auditChainHeads = pgTable(
  'audit_chain_heads',
  {
    organizationId: uuid()
      .primaryKey()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    lastSeq: bigint({ mode: 'number' }).notNull().default(0),
    /** 32 zero bytes before the first seal. */
    lastHash: bytea().notNull(),
    lastSealedAt: timestamp({ withTimezone: true }),
    ...timestamps(),
  },
  (t) => [tenantPolicy('audit_chain_heads', t.organizationId)],
)
