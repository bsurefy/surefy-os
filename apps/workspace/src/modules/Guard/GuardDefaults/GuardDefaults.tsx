// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Shield } from 'lucide-react'

import { IconTile } from '@surefy/ui/components/DataDisplay'
import { ErrorState, SkeletonCard } from '@surefy/ui/components/Feedback'
import { PageHeader } from '@surefy/ui/components/Layout'

import GuardTabs from '../GuardTabs'
import DefaultsForm from './DefaultsForm'
import { useGuardDefaultsController } from './GuardDefaults.controller'

/**
 * Guard › Defaults (design/workspace/guard.md): the organization's confidence thresholds with the
 * impact preview, and the approval settings (quick-approve limit, step-up amount, target time).
 * Saving applies to every agent and flow that uses defaults.
 */
export default function GuardDefaults() {
  const c = useGuardDefaultsController()
  const { t } = c

  let body
  if (c.errorMessage) {
    body = (
      <ErrorState
        title={t('loadError')}
        message={c.errorMessage}
        reference={c.errorReference}
        onRetry={c.refetch}
      />
    )
  } else if (c.isLoading || !c.settings) {
    body = (
      <div aria-busy className="flex flex-col gap-6">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    )
  } else {
    body = <DefaultsForm settings={c.settings} canManage={c.canManage} />
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        icon={<IconTile icon={Shield} />}
        tabs={<GuardTabs active="defaults" />}
      />
      {body}
    </div>
  )
}
