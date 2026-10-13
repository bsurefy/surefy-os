// SPDX-License-Identifier: AGPL-3.0-only
import { createLoader, parseAsString, parseAsStringLiteral } from 'nuqs/server'

import { APPROVAL_KINDS, APPROVAL_RISKS } from '@surefy/contracts'

import { APPROVAL_VIEWS } from './Approvals.constants'

/** `?view=&q=&kind=&risk=`: the list, search and filters survive a reload and can be shared. */
export const approvalsSearchParams = {
  view: parseAsStringLiteral(APPROVAL_VIEWS).withDefault('pending'),
  q: parseAsString.withDefault(''),
  kind: parseAsStringLiteral(APPROVAL_KINDS),
  risk: parseAsStringLiteral(APPROVAL_RISKS),
}

export const loadApprovalsSearchParams = createLoader(approvalsSearchParams)
