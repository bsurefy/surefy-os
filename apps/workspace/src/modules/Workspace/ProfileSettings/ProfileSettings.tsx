// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useTranslations } from 'next-intl'

import { SkeletonCard, SkeletonForm } from '@surefy/ui/components/Feedback'
import { PageHeader } from '@surefy/ui/components/Layout'
import { Skeleton } from '@surefy/ui/primitives/skeleton'

import { useMe } from '../Workspace.hooks'
import ProfileAccess from './ProfileAccess'
import ProfileDetails from './ProfileDetails'
import ProfilePreferences from './ProfilePreferences'
import ProfileSecurity from './ProfileSecurity'
import ProfileSessions from './ProfileSessions'

import type { ProfileSettingsProps } from './ProfileSettings.types'

/** The person's own settings (design/workspace/settings.md §2), for every role. */
export default function ProfileSettings({ orgSlug, children }: Readonly<ProfileSettingsProps>) {
  const t = useTranslations('workspace.profile')
  const { data: me } = useMe()
  const organization = me?.memberships.find(
    (membership) => membership.organization.slug === orgSlug,
  )?.organization.name

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} description={t('description')} />
      {me ? (
        <>
          <ProfileDetails user={me.user} />
          <div className="grid gap-6 lg:grid-cols-2">
            <ProfilePreferences />
            <ProfileSecurity isTwoFactorOn={me.user.twoFactorEnabled} />
          </div>
          {organization && <ProfileAccess organization={organization} />}
          <ProfileSessions />
          {children}
        </>
      ) : (
        <>
          <div className="border-border bg-surface flex items-center gap-4 rounded-xl border p-5">
            <Skeleton className="size-12 rounded-full" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3.5 w-56" />
            </div>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <SkeletonForm fields={3} />
            <SkeletonForm fields={2} />
          </div>
          <SkeletonCard lines={3} />
          <SkeletonCard lines={2} />
        </>
      )}
    </div>
  )
}
