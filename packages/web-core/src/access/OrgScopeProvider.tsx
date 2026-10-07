// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { createContext, useContext } from 'react'

import type { ReactNode } from 'react'

const OrgScopeContext = createContext<string | null>(null)

/**
 * The organization the gating hooks read effective access for. The workspace's `[orgSlug]`
 * layout wraps its children in it after its server guard resolved the organization.
 */
export function OrgScopeProvider({
  orgId,
  children,
}: Readonly<{ orgId: string; children: ReactNode }>) {
  return <OrgScopeContext.Provider value={orgId}>{children}</OrgScopeContext.Provider>
}

/** The current organization's ID. Throws outside `OrgScopeProvider`: a gate there is a bug. */
export function useCurrentOrgId(): string {
  const orgId = useContext(OrgScopeContext)
  if (orgId === null) throw new Error('useCurrentOrgId needs an OrgScopeProvider above it')
  return orgId
}
