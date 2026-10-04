// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The Drizzle schema: every table file (`<domain>.tables.ts`, including `partitioned/`) and
 * `relations.ts` is re-exported here, so the client and drizzle-kit see one schema. Module tasks
 * append one `export *` line per domain file, in migration order (conventions-and-security.md,
 * §16): auth, organizations and members, install, vault and access, chat and knowledge, usage
 * and audit, platform tables.
 */
export * from './notifications.tables.js'
