// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useTranslations } from 'next-intl'

import { AddKeyDialog, AddServerDialog } from '@/modules/Vault'
import { Button } from '@surefy/ui/primitives/button'
import { OrgScopeProvider } from '@surefy/web-core/access'

import { useModelStepController } from './ModelStep.controller'

export interface ModelStepProps {
  orgId: string
  onBack?: () => void
  onContinue: () => void
}

/**
 * AI model: a cloud provider key (Vault's add-key dialog, with its required connection test) or a
 * local server, or skip. Skipping is remembered, and Chat then opens with "Connect a model".
 */
export default function ModelStep({ orgId, onBack, onContinue }: Readonly<ModelStepProps>) {
  const c = useModelStepController(orgId)
  const { t } = c
  const tWizard = useTranslations('setup.wizard')

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-page-title">{t('title')}</h1>
        <p className="text-body text-muted-foreground">{t('description')}</p>
      </div>
      {c.isConnected && (
        <div className="flex flex-col gap-2">
          <p className="text-label text-success">{t('connected', { count: c.modelCount })}</p>
          <ul aria-label={t('connectedLabel')} className="flex flex-col gap-1">
            {c.connected.map((credential) => (
              <li key={credential.id} className="text-body">
                {credential.name}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="grid gap-3">
        <section className="border-border flex flex-col gap-3 rounded-lg border p-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-section-title">{t('cloud.title')}</h2>
            <p className="text-caption text-muted-foreground">{t('cloud.description')}</p>
          </div>
          <Button variant="secondary" className="self-start" onClick={c.openKey}>
            {t('cloud.action')}
          </Button>
        </section>
        <section className="border-border flex flex-col gap-3 rounded-lg border p-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-section-title">{t('local.title')}</h2>
            <p className="text-caption text-muted-foreground">{t('local.description')}</p>
          </div>
          <Button variant="secondary" className="self-start" onClick={c.openServer}>
            {t('local.action')}
          </Button>
        </section>
      </div>
      {!c.isConnected && <p className="text-caption text-muted-foreground">{t('skipNote')}</p>}
      <div className="flex items-center justify-between gap-3">
        {onBack ? (
          <Button variant="secondary" onClick={onBack}>
            {tWizard('back')}
          </Button>
        ) : (
          <span />
        )}
        <Button variant={c.isConnected ? 'primary' : 'secondary'} onClick={onContinue}>
          {c.isConnected ? t('continue') : t('skip')}
        </Button>
      </div>
      <OrgScopeProvider orgId={orgId}>
        {c.dialog === 'key' && (
          <AddKeyDialog orgId={orgId} mode="organization" onClose={c.closeDialog} />
        )}
        {c.dialog === 'server' && <AddServerDialog orgId={orgId} onClose={c.closeDialog} />}
      </OrgScopeProvider>
    </div>
  )
}
