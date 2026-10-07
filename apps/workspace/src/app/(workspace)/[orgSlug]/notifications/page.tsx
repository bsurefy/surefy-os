// SPDX-License-Identifier: AGPL-3.0-only
import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import { getTranslations } from 'next-intl/server'

import { notificationQueries } from '@/api/notifications'
import { checkPageAccess } from '@/core/auth'
import { loadNotificationFilters, NoAccessState, NotificationCenter } from '@/modules/Workspace'
import { PERMISSIONS } from '@surefy/contracts'
import { getServerHttpClient } from '@surefy/web-core/http/server'
import { getQueryClient } from '@surefy/web-core/query'

import type { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('workspace.notifications')
  return { title: t('title') }
}

export default async function NotificationsPage({
  params,
  searchParams,
}: Readonly<PageProps<'/[orgSlug]/notifications'>>) {
  const { orgSlug } = await params
  const { org, isAllowed } = await checkPageAccess(orgSlug, PERMISSIONS.NOTIFICATIONS_READ)
  if (!isAllowed) return <NoAccessState area="notifications" />

  const { show } = await loadNotificationFilters(searchParams)
  const queryClient = getQueryClient()
  // A failed prefetch is swallowed: the list then shows its own error state
  await queryClient
    .infiniteQuery(
      notificationQueries.list(
        org.id,
        { unreadOnly: show === 'unread' },
        await getServerHttpClient(),
      ),
    )
    .catch(() => null)

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <NotificationCenter orgId={org.id} orgSlug={orgSlug} />
    </HydrationBoundary>
  )
}
