// SPDX-License-Identifier: AGPL-3.0-only
import { defineConfig } from 'drizzle-kit'

// drizzle-kit runs outside the app, so it reads the env itself (configuration.md, §2).
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/database/tables/*.tables.ts', // not tables/partitioned/: those parents are custom SQL
  out: './src/database/migrations',
  casing: 'snake_case',
  migrations: { schema: 'drizzle', table: '__drizzle_migrations' },
  dbCredentials: { url: process.env.DATABASE_MIGRATION_URL ?? '' },
})
