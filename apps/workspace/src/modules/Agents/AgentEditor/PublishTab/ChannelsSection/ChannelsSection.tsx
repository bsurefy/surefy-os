// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Code2, MessageSquare } from 'lucide-react'
import Link from 'next/link'

import { toRoute } from '@/modules/Workspace'
import { CodeBlock, IconTile, StatusPill } from '@surefy/ui/components/DataDisplay'
import { Banner } from '@surefy/ui/components/Feedback'
import { SwitchField } from '@surefy/ui/components/Forms'
import { Section } from '@surefy/ui/components/Layout'
import { Button } from '@surefy/ui/primitives/button'

import { useChannelsSectionController } from './ChannelsSection.controller'

import type { ChannelsSectionProps } from './ChannelsSection.types'

/** Channels: SurefyOS chat and the API, with their status and how to call the agent. */
export default function ChannelsSection(props: Readonly<ChannelsSectionProps>) {
  const c = useChannelsSectionController(props)
  const { t } = c
  const { canChange, wantsApi, onWantsApiChange } = props
  const showApiDetails = c.api !== null || wantsApi

  return (
    <Section title={t('title')} description={t('description')}>
      <div className="flex flex-col gap-4">
        <div className="border-border flex items-center gap-3 rounded-lg border px-3 py-3">
          <IconTile icon={MessageSquare} size="sm" tone="primary" />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-body text-foreground font-medium">{t('chat.name')}</span>
            <span className="text-caption text-muted-foreground">{t('chat.help')}</span>
          </div>
          {c.chat ? (
            <StatusPill tone={c.chat.tone} label={t(`status.${c.chat.status}`)} />
          ) : (
            <StatusPill tone="neutral" label={t('status.off')} />
          )}
        </div>
        <div className="border-border flex flex-col gap-4 rounded-lg border px-3 py-3">
          <div className="flex items-center gap-3">
            <IconTile icon={Code2} size="sm" tone="primary" />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-body text-foreground font-medium">{t('api.name')}</span>
              <span className="text-caption text-muted-foreground">{t('api.help')}</span>
            </div>
            <StatusPill
              tone={c.api?.tone ?? 'neutral'}
              label={t(`status.${c.api?.status ?? 'off'}`)}
            />
          </div>
          {c.api === null && (
            <SwitchField
              label={t('api.turnOn')}
              description={c.isRequest ? t('api.requestHelp') : t('api.turnOnHelp')}
              checked={wantsApi}
              onCheckedChange={onWantsApiChange}
              disabled={!canChange}
            />
          )}
          {c.api?.status === 'pending_approval' && (
            <Banner
              tone="info"
              title={t('api.waiting.title')}
              description={t('api.waiting.description')}
            />
          )}
          {showApiDetails && (
            <div className="flex flex-col gap-4">
              {c.unavailable && (
                <Banner
                  tone="info"
                  title={t(`api.unavailable.${c.unavailable}.title`)}
                  description={t(`api.unavailable.${c.unavailable}.description`)}
                />
              )}
              <p className="text-body text-foreground">
                {c.exposure ? t('api.exposes', { names: c.exposure }) : t('api.exposesNothing')}
              </p>
              <p className="text-body text-muted-foreground">
                {t('api.rateLimit', { count: c.api?.rateLimit ?? c.rateLimit })}
              </p>
              <div className="flex flex-col gap-2">
                <p className="text-body text-foreground font-medium">{t('api.howTo')}</p>
                <CodeBlock
                  language="bash"
                  code={c.example}
                  labels={{ copy: t('api.copy'), copied: t('api.copied') }}
                  shouldMaskSecrets={false}
                />
                <p className="text-caption text-muted-foreground">{t('api.streamHelp')}</p>
                <CodeBlock
                  language="bash"
                  code={c.streamExample}
                  labels={{ copy: t('api.copy'), copied: t('api.copied') }}
                  shouldMaskSecrets={false}
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-body text-muted-foreground">
                  {c.canManageKeys ? t('api.keysAdmin') : t('api.keysBuilder')}
                </p>
                {c.canManageKeys && (
                  <Button asChild variant="secondary" size="sm">
                    <Link href={toRoute(c.keysHref)}>{t('api.createKey')}</Link>
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </Section>
  )
}
