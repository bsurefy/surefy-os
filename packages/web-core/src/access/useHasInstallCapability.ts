// SPDX-License-Identifier: AGPL-3.0-only
import { useQuery } from '@tanstack/react-query'

import type { InstallCapability } from '@surefy/contracts'

import { hasInstallCapability } from './installCapabilities'
import { meQueries } from '../api/me/me.queries'

/** Whether the install offers `capability`; false until `GET /api/v1/me` is known. */
export function useHasInstallCapability(capability: InstallCapability): boolean {
  const { data } = useQuery(meQueries.current())
  return data ? hasInstallCapability(data.install, capability) : false
}
