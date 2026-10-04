// SPDX-License-Identifier: AGPL-3.0-only
// Cache keys are colon-separated and scoped; the client adds the `surefy:` prefix. Tenant data is
// always under `org:{orgId}:` so keys can never collide across organizations.

/** The scope every cached tenant value lives under, also used for `cache.bumpVersion`. */
export const orgScope = (orgId: string): string => `org:${orgId}`

/** `org:{orgId}:<parts...>` */
export const orgKey = (orgId: string, ...parts: readonly (string | number)[]): string =>
  [orgScope(orgId), ...parts].join(':')

/** `<scope>:<parts...>:v{version}`, for values invalidated as a group by bumping the version. */
export const versionedKey = (
  scope: string,
  version: number,
  ...parts: readonly (string | number)[]
): string => [scope, ...parts, `v${version}`].join(':')
