// SPDX-License-Identifier: AGPL-3.0-only
/**
 * What the global setup starts once per run and hands to every test file through Vitest's
 * `provide` / `inject`: the two containers and the migrated template database.
 */
export interface TestInfrastructure {
  postgres: {
    host: string
    port: number
    /** The container's superuser, for creating and dropping per-file databases only. */
    adminUrl: string
    /** The database migrated as `surefy_owner`; every test file clones it. */
    templateDatabase: string
    ownerPassword: string
    appPassword: string
  }
  redis: {
    host: string
    port: number
    /** Logical databases the server was started with; each worker takes one. */
    databases: number
  }
}

declare module 'vitest' {
  export interface ProvidedContext {
    infrastructure: TestInfrastructure
  }
}
