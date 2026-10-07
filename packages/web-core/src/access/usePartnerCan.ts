// SPDX-License-Identifier: AGPL-3.0-only
import { useQuery } from '@tanstack/react-query'

import { meQueries } from '../api/me/me.queries'

/**
 * Whether the person's role in the partner `partnerId` grants `permission` (the partner portal).
 * A partner they do not belong to answers false.
 */
export function usePartnerCan(partnerId: string, permission: string): boolean {
  const { data } = useQuery(meQueries.current())
  const membership = data?.partners.find((item) => item.partner.id === partnerId)
  return membership?.permissions.includes(permission) ?? false
}
