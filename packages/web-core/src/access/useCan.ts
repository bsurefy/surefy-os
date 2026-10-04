// SPDX-License-Identifier: AGPL-3.0-only
import type { ModuleKey, Permission } from '@surefy/contracts'

import { hasModule, hasPermission } from './accessChecks'
import { useEffectiveAccess } from './useEffectiveAccess'

/** Whether the person holds `permission` in the current organization; false until access is known. */
export function useCan(permission: Permission): boolean {
  const { data } = useEffectiveAccess()
  return data ? hasPermission(data, permission) : false
}

/** Whether `module` is on for the person (plan, organization and team restrictions applied). */
export function useHasModule(module: ModuleKey): boolean {
  const { data } = useEffectiveAccess()
  return data ? hasModule(data, module) : false
}
