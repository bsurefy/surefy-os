// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'

import { ROUTES } from '@/constants/routes'
import { toRoute } from '@/modules/Workspace'
import { PageHeader } from '@surefy/ui/components/Layout'
import { Breadcrumbs } from '@surefy/ui/components/Navigation'

import TemplatePicker from './TemplatePicker'

/**
 * Templates (Agents › Templates): Customer Support, HR Helper, Sales Assistant, Invoice Checker and
 * "Start from scratch". Each card lists the tools, knowledge and Guard rules it sets up.
 */
export default function AgentTemplates() {
  const t = useTranslations('agents.templates')
  const { orgSlug } = useParams<{ orgSlug: string }>()
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        breadcrumb={
          <Breadcrumbs
            label={t('breadcrumb')}
            linkComponent={Link}
            items={[
              { label: t('agents'), href: toRoute(ROUTES.workspace.agents(orgSlug)) },
              { label: t('title') },
            ]}
          />
        }
      />
      <TemplatePicker />
    </div>
  )
}
