// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import Link from 'next/link'

import { PageHeader } from '@surefy/ui/components/Layout'
import { Tabs } from '@surefy/ui/components/Navigation'

import FallbackTab from '../FallbackTab'
import LocalModelsTab from '../LocalModelsTab'
import ModelAccessTab from '../ModelAccessTab'
import ModelList from '../ModelList'
import ProvidersTab from '../ProvidersTab'
import { useVaultSettingsController } from './VaultSettings.controller'

/**
 * Settings › Vault: providers and keys, local models, model access and fallback. People with only
 * `vault:read` (Builders) see the read-only list of the models they may use instead.
 */
export default function VaultSettings() {
  const c = useVaultSettingsController()
  const { t } = c

  if (!c.canManage) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t('page.title')} description={t('builder.description')} />
        <ModelList />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('page.title')} description={t('page.description')} />
      <Tabs label={t('tabs.label')} items={c.tabs} value={c.activeTab} linkComponent={Link} />
      {c.activeTab === 'providers' && <ProvidersTab />}
      {c.activeTab === 'local-models' && <LocalModelsTab />}
      {c.activeTab === 'model-access' && <ModelAccessTab />}
      {c.activeTab === 'fallback' && <FallbackTab />}
    </div>
  )
}
