// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Button } from '@surefy/ui/primitives/button'

import AuthCard from '../AuthCard'
import { useChooseOrganizationController } from './ChooseOrganization.controller'

import type { ChooseOrganizationProps } from './ChooseOrganization.types'

/** Choose organization: only for people in several without a last-used one. */
export default function ChooseOrganization({ memberships }: Readonly<ChooseOrganizationProps>) {
  const { pendingOrganizationId, onChoose, t } = useChooseOrganizationController()

  return (
    <AuthCard title={t('title')} description={t('description')}>
      <ul className="flex flex-col gap-2">
        {memberships.map(({ organization, role }) => (
          <li key={organization.id}>
            <Button
              variant="secondary"
              className="h-auto w-full justify-between py-3"
              isLoading={pendingOrganizationId === organization.id}
              onClick={() => {
                onChoose(organization)
              }}
            >
              <span className="font-medium">{organization.name}</span>
              <span className="text-caption text-muted-foreground">{t(`roles.${role}`)}</span>
            </Button>
          </li>
        ))}
      </ul>
    </AuthCard>
  )
}
