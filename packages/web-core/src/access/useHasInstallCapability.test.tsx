// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { useHasInstallCapability } from './useHasInstallCapability'
import { meKeys } from '../api/me/me.queries'
import {
  createTestQueryClient,
  installCapabilitiesFactory,
  meFactory,
  renderHookWithProviders,
} from '../testing'

describe('useHasInstallCapability', () => {
  it('reads the install capabilities of the session', () => {
    const queryClient = createTestQueryClient()
    queryClient.setQueryData(
      meKeys.current(),
      meFactory({ install: installCapabilitiesFactory({ licenseManagement: false }) }),
    )

    const license = renderHookWithProviders(() => useHasInstallCapability('licenseManagement'), {
      queryClient,
    })
    const plans = renderHookWithProviders(() => useHasInstallCapability('planBilling'), {
      queryClient,
    })

    expect(license.result.current).toBe(false)
    expect(plans.result.current).toBe(false)
  })

  it('is false until the session is known', () => {
    const queryClient = createTestQueryClient()
    // a fetch already in flight that never settles: the hook's query joins it
    const neverSettles = new Promise<never>(() => {
      // never resolves or rejects
    })
    void queryClient.query({ queryKey: meKeys.current(), queryFn: () => neverSettles })

    const { result } = renderHookWithProviders(() => useHasInstallCapability('licenseManagement'), {
      queryClient,
    })

    expect(result.current).toBe(false)
  })
})
