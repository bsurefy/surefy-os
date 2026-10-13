// SPDX-License-Identifier: AGPL-3.0-only
import { getTranslations } from 'next-intl/server'

import { checkPageAccess } from '@/core/auth'
import { DataFilters } from '@/modules/Guard'
import { assertNavReleased, NoAccessState } from '@/modules/Workspace'
import { PERMISSIONS } from '@surefy/contracts'

import type { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('guard.dataFilters')
  return { title: t('title') }
}

/** Guard › Data filters. */
export default async function DataFiltersPage({
  params,
}: Readonly<PageProps<'/[orgSlug]/guard/data-filters'>>) {
  assertNavReleased('guard')
  const { orgSlug } = await params
  const { isAllowed } = await checkPageAccess(orgSlug, PERMISSIONS.GUARD_READ)
  if (!isAllowed) return <NoAccessState area="guard" />
  return <DataFilters />
}
