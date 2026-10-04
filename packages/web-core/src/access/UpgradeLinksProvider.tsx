// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { createContext, useContext } from 'react'

import type { ReactNode } from 'react'

/**
 * Where the upgrade card's actions lead. The app's server layout sets them for its install, so the
 * card itself never knows the edition or the deployment: an action without a link is not shown.
 */
export interface UpgradeLinks {
  /** "Compare editions": the public page that compares the editions. */
  compareEditionsUrl?: string
  /** "Enter license key": the License settings; offered to install administrators only. */
  licenseHref?: string
  /** "See plans": the plans and billing page; offered to people who manage billing only. */
  plansHref?: string
}

const UpgradeLinksContext = createContext<UpgradeLinks>({})

export function UpgradeLinksProvider({
  links,
  children,
}: Readonly<{ links: UpgradeLinks; children: ReactNode }>) {
  return <UpgradeLinksContext.Provider value={links}>{children}</UpgradeLinksContext.Provider>
}

export function useUpgradeLinks(): UpgradeLinks {
  return useContext(UpgradeLinksContext)
}
