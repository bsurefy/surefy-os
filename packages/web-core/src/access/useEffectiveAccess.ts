// SPDX-License-Identifier: AGPL-3.0-only
import { useQuery } from '@tanstack/react-query'

import { useCurrentOrgId } from './OrgScopeProvider'
import { accessQueries } from '../api/access/access.queries'

/** The current organization's effective access; prefetched by the layout, so usually ready at once. */
export function useEffectiveAccess() {
  const orgId = useCurrentOrgId()
  return useQuery(accessQueries.me(orgId))
}
