// SPDX-License-Identifier: AGPL-3.0-only
import { useQuery } from '@tanstack/react-query'

import { meQueries } from '../api/me/me.queries'

/**
 * Whether the person's platform role grants `permission` (the console). Platform permission keys
 * are defined by the Cloud edition, so they are plain strings here. False until `me` is known.
 */
export function usePlatformCan(permission: string): boolean {
  const { data } = useQuery(meQueries.current())
  return data?.platform?.permissions.includes(permission) ?? false
}
