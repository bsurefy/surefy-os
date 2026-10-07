// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Button } from '@surefy/ui/primitives/button'

import AuthCard from '../AuthCard'
import { useNoOrganizationController } from './NoOrganization.controller'

/** No organization: "You're not in an organization yet · Ask for an invite". */
export default function NoOrganization() {
  const { onSignOut, t } = useNoOrganizationController()

  return (
    <AuthCard title={t('title')} description={t('description')}>
      <Button variant="secondary" onClick={onSignOut}>
        {t('signOut')}
      </Button>
    </AuthCard>
  )
}
