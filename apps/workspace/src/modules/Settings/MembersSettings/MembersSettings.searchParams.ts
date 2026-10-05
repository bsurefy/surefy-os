// SPDX-License-Identifier: AGPL-3.0-only
import { createLoader, parseAsString, parseAsStringLiteral } from 'nuqs/server'

import { ORG_ROLES } from '@surefy/contracts'

import { MEMBER_SORTS, MEMBER_STATUS_FILTERS } from './MembersSettings.constants'

/** `?q=&role=&status=&team=&sort=`: the table's filters survive a reload and can be shared. */
export const membersSearchParams = {
  q: parseAsString.withDefault(''),
  role: parseAsStringLiteral(ORG_ROLES),
  status: parseAsStringLiteral(MEMBER_STATUS_FILTERS).withDefault('all'),
  team: parseAsString,
  sort: parseAsStringLiteral(MEMBER_SORTS).withDefault('name'),
}

export const loadMembersSearchParams = createLoader(membersSearchParams)
