// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The public module services the container exposes to jobs and extensions (`audit`, `access`,
 * `usage`, …). Module tasks turn this into an interface with one property per module; until
 * then it is an open record.
 */
export type PublicModules = Record<string, unknown>
