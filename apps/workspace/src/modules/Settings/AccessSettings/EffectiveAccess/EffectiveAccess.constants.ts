// SPDX-License-Identifier: AGPL-3.0-only
export const SUBJECT_KIND = { PERSON: 'person', TEAM: 'team' } as const
export type SubjectKind = (typeof SUBJECT_KIND)[keyof typeof SUBJECT_KIND]

/** One page of people and teams feeds the picker; larger organizations search in Members and Teams. */
export const SUBJECT_LOOKUP_LIMIT = 100
