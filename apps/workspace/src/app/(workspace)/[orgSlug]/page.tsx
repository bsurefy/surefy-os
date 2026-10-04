// SPDX-License-Identifier: AGPL-3.0-only
import { redirect } from 'next/navigation'

import { ROUTES } from '@/constants/routes'

/** An organization opens on Chat. */
export default async function OrganizationPage({ params }: Readonly<PageProps<'/[orgSlug]'>>) {
  const { orgSlug } = await params
  redirect(ROUTES.workspace.home(orgSlug))
}
