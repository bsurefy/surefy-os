// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Why a caller needs cross-tenant access. Every `db.system` call passes one and it is logged.
 * Modules extend this union with their own reasons; the private Cloud packages add
 * `partner-portal`, `platform` and `billing`.
 */
export type SystemScopeReason =
  | 'outbox-relay'
  | 'usage-aggregation'
  | 'maintenance'
  | 'data-control'
  | 'key-rotation'
  | 'connection-refresh'
  | 'bridge-catalog-sync'
  | 'access-version'
  | 'knowledge-sync'
  | 'partner-portal'
  | 'platform'
  | 'billing'
  | 'test'
