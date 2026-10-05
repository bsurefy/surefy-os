// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'

import { ROUTES } from '@/constants/routes'
import { toRoute } from '@/modules/Workspace'
import { Button } from '@surefy/ui/primitives/button'

import type { SetupOrganization } from '../Setup.types'

/** `/setup` once setup is over: "Setup is already complete" with the way on. */
export default function AlreadyComplete({
  organization,
}: Readonly<{ organization: SetupOrganization | null }>) {
  const t = useTranslations('setup.complete')
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-page-title">{t('title')}</h1>
        <p className="text-body text-muted-foreground">{t('description')}</p>
      </div>
      <Button asChild>
        <Link
          href={toRoute(
            organization ? ROUTES.workspace.home(organization.slug) : ROUTES.auth.login,
          )}
        >
          {organization ? t('openWorkspace') : t('signIn')}
        </Link>
      </Button>
    </div>
  )
}
