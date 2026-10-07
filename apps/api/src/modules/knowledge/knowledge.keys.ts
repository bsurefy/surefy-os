// SPDX-License-Identifier: AGPL-3.0-only

/** Object keys of a document: every key starts with `orgs/{orgId}/` (multi-tenancy.md, §5). */
export const documentPrefix = (orgId: string, documentId: string): string =>
  `orgs/${orgId}/knowledge/${documentId}/`

/** The uploaded file, or the fetched page. */
export const sourceKeyOf = (orgId: string, documentId: string): string =>
  `${documentPrefix(orgId, documentId)}source`

/** The ML parse output, reused for re-chunking and re-embedding. */
export const parsedKeyOf = (orgId: string, documentId: string): string =>
  `${documentPrefix(orgId, documentId)}parsed.json`
