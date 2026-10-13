// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { LayoutTemplate } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { IconTile, StatusPill } from '@surefy/ui/components/DataDisplay'
import { Button } from '@surefy/ui/primitives/button'

import { SETUP_TONE } from '../AgentTemplates.constants'

import type { TemplateCardProps } from './TemplateCard.types'

/**
 * One template: what it sets up (tools, knowledge, Guard rules) and the model it suggests. Tools
 * that need a connection, or a bridge the organization has not installed, are marked; the agent is
 * created either way.
 */
export default function TemplateCard({
  template,
  canInstallBridges,
  isCreating,
  isDisabled,
  onUse,
}: Readonly<TemplateCardProps>) {
  const t = useTranslations('agents.templates.card')
  const headingId = `template-${template.key}`
  const section = (label: string, children: React.ReactNode) => (
    <div className="flex flex-col gap-1">
      <h4 className="text-caption text-muted-foreground font-medium">{label}</h4>
      {children}
    </div>
  )
  return (
    <li
      aria-labelledby={headingId}
      className="border-border bg-surface flex flex-col gap-4 rounded-xl border p-4"
    >
      <div className="flex items-start gap-3">
        <IconTile icon={LayoutTemplate} />
        <div className="flex min-w-0 flex-col gap-1">
          <h3 id={headingId} className="text-body font-semibold">
            {template.name}
          </h3>
          <p className="text-label text-foreground-secondary">{template.description}</p>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3">
        {section(
          t('tools'),
          template.tools.length > 0 ? (
            <ul className="flex flex-col gap-1.5">
              {template.tools.map((tool) => (
                <li key={tool.name} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-label font-medium">{tool.name}</span>
                  <span className="text-caption text-muted-foreground">
                    {t(`permissions.${tool.permission}`)}
                  </span>
                  {SETUP_TONE[tool.setup] && (
                    <StatusPill tone="warning" label={t(`setup.${tool.setup}`)} />
                  )}
                  {tool.setup === 'bridge_not_installed' && (
                    <span className="text-caption text-muted-foreground">
                      {canInstallBridges ? t('setup.install') : t('setup.requestInstall')}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-label text-muted-foreground">{t('noTools')}</span>
          ),
        )}
        {template.knowledgeSuggestion &&
          section(
            t('knowledge'),
            <span className="text-label">
              {t('knowledgeSuggestion', { name: template.knowledgeSuggestion })}
            </span>,
          )}
        {template.guardRules.length > 0 &&
          section(
            t('guard'),
            <ul className="text-label flex list-disc flex-col gap-0.5 pl-4">
              {template.guardRules.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>,
          )}
        {section(
          t('model'),
          <span className="text-label">
            {template.suggestedModel?.displayName ?? t('noSuggestedModel')}
          </span>,
        )}
      </div>
      <Button
        variant="secondary"
        isLoading={isCreating}
        disabled={isDisabled}
        onClick={() => {
          onUse(template)
        }}
        aria-describedby={headingId}
      >
        {t('use')}
      </Button>
    </li>
  )
}
