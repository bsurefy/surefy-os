// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Code2, MessageSquare } from 'lucide-react'
import Link from 'next/link'

import { toRoute } from '@/modules/Workspace'
import { CodeBlock } from '@surefy/ui/components/DataDisplay'
import { Banner } from '@surefy/ui/components/Feedback'
import { SwitchField } from '@surefy/ui/components/Forms'
import { Section } from '@surefy/ui/components/Layout'
import { Button } from '@surefy/ui/primitives/button'

import ChannelCard, { ChannelExposure } from './ChannelCard'
import { useChannelsSectionController } from './ChannelsSection.controller'
import LiveChannel from './LiveChannel'
import MessagingChannel from './MessagingChannel'
import WidgetChannel from './WidgetChannel'

import type { ChannelsSectionProps } from './ChannelsSection.types'

/**
 * Channels: SurefyOS chat, the API, the website widget, Slack and WhatsApp, with their state, how
 * to set each up, and what anyone on an external channel can reach.
 */
export default function ChannelsSection(props: Readonly<ChannelsSectionProps>) {
  const c = useChannelsSectionController(props)
  const { t, context } = c
  const { canChange, onRequestChange, widgetToken, onWidgetTokenChange } = props

  const apiDetails = (
    <div className="flex flex-col gap-4">
      {context.unavailable && (
        <Banner
          tone="info"
          title={t(`api.unavailable.${context.unavailable}.title`)}
          description={t(`api.unavailable.${context.unavailable}.description`)}
        />
      )}
      <ChannelExposure type="api" exposure={context.exposure} />
      <p className="text-body text-muted-foreground">
        {t('api.rateLimit', { count: c.apiRateLimit })}
      </p>
      <div className="flex flex-col gap-2">
        <p className="text-body text-foreground font-medium">{t('api.howTo')}</p>
        <CodeBlock
          language="bash"
          code={c.example}
          labels={{ copy: t('copy'), copied: t('copied') }}
          shouldMaskSecrets={false}
        />
        <p className="text-caption text-muted-foreground">{t('api.streamHelp')}</p>
        <CodeBlock
          language="bash"
          code={c.streamExample}
          labels={{ copy: t('copy'), copied: t('copied') }}
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
  )

  return (
    <Section title={t('title')} description={t('description')}>
      <div className="flex flex-col gap-4">
        <ChannelCard
          icon={MessageSquare}
          name={t('chat.name')}
          help={t('chat.help')}
          status={context.statusOf(c.chat, false)}
        />
        <ChannelCard
          icon={Code2}
          name={t('api.name')}
          help={t('api.help')}
          status={context.statusOf(c.api, c.wantsApi)}
        >
          {c.api ? (
            <LiveChannel
              channel={c.api}
              name={t('names.api')}
              context={context}
              onWidgetTokenChange={onWidgetTokenChange}
            >
              {apiDetails}
            </LiveChannel>
          ) : (
            <>
              <SwitchField
                label={t('api.turnOn')}
                description={c.isRequest ? t('api.requestHelp') : t('api.turnOnHelp')}
                checked={c.wantsApi}
                onCheckedChange={c.onWantsApiChange}
                disabled={!canChange}
              />
              {c.wantsApi && apiDetails}
            </>
          )}
        </ChannelCard>
        <WidgetChannel
          channel={c.widget}
          request={c.widgetRequest}
          context={context}
          apiBaseUrl={c.apiBaseUrl}
          onRequestChange={(request) => {
            onRequestChange('widget', request)
          }}
          widgetToken={widgetToken}
          onWidgetTokenChange={onWidgetTokenChange}
        />
        <MessagingChannel
          type="slack"
          channel={c.slack}
          request={c.slackRequest}
          context={context}
          onRequestChange={(request) => {
            onRequestChange('slack', request)
          }}
          onWidgetTokenChange={onWidgetTokenChange}
        />
        <MessagingChannel
          type="whatsapp"
          channel={c.whatsapp}
          request={c.whatsappRequest}
          context={context}
          onRequestChange={(request) => {
            onRequestChange('whatsapp', request)
          }}
          onWidgetTokenChange={onWidgetTokenChange}
        />
      </div>
    </Section>
  )
}
