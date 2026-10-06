// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useTranslations } from 'next-intl'

import { SkeletonCard } from '@surefy/ui/components/Feedback'
import { PageHeader } from '@surefy/ui/components/Layout'

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
        <SkeletonCard lines={3} />
      )}
    </div>
  )
}
