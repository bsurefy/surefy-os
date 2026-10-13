// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Hash, MessageCircle } from 'lucide-react'

import { Button } from '@surefy/ui/primitives/button'

import ChannelCard, { ChannelExposure, CopyField, QueuedChannel } from '../ChannelCard'
import LiveChannel from '../LiveChannel'
import { useMessagingChannelController } from './MessagingChannel.controller'
import MessagingDialog from './MessagingDialog'

import type { MessagingChannelProps } from './MessagingChannel.types'

const ICONS = { slack: Hash, whatsapp: MessageCircle } as const

/** Slack or WhatsApp: the connection it answers through, and the provider's webhook set-up. */
export default function MessagingChannel(props: Readonly<MessagingChannelProps>) {
  const c = useMessagingChannelController(props)
  const { t } = c
  const { type, channel, request, context, onWidgetTokenChange } = props

  const summary = (
    <div className="flex flex-col gap-1">
      <ChannelExposure type={type} exposure={context.exposure} />
      {c.connection && (
        <p className="text-body text-muted-foreground">
          {c.connection.state
            ? t('messaging.throughState', {
                connection: c.connection.name,
                state: c.connection.state,
              })
            : t('messaging.through', { connection: c.connection.name })}
        </p>
      )}
      {c.hasNoConnection && (
        <p className="text-body text-muted-foreground">{t('messaging.noConnection')}</p>
      )}
      {c.answers && <p className="text-body text-muted-foreground">{c.answers}</p>}
    </div>
  )

  return (
    <ChannelCard
      icon={ICONS[type]}
      name={t(`messaging.${type}.name`)}
      help={t(`messaging.${type}.help`)}
      status={c.status}
    >
      {channel && (
        <LiveChannel
          channel={channel}
          name={c.name}
          context={context}
          onEdit={c.onEdit}
          onWidgetTokenChange={onWidgetTokenChange}
        >
          {summary}
          {c.webhook && (
            <div className="flex flex-col gap-3">
              <p className="text-body text-foreground">{t(`messaging.${type}.setUpSteps`)}</p>
              <CopyField label={t(`messaging.${type}.webhookLabel`)} value={c.webhook.url} />
              {c.webhook.verifyToken && (
                <CopyField
                  label={t('messaging.whatsapp.verifyToken')}
                  value={c.webhook.verifyToken}
                />
              )}
            </div>
          )}
        </LiveChannel>
      )}
      {!channel && request && (
        <QueuedChannel
          name={c.name}
          isRequest={!context.canManage}
          canChange={context.canChange}
          onEdit={c.onEdit}
          onDrop={c.onDrop}
        >
          {summary}
        </QueuedChannel>
      )}
      {!channel && !request && context.canChange && (
        <div>
          <Button size="sm" variant="secondary" onClick={c.onEdit}>
            {t(`messaging.${type}.setUp`)}
          </Button>
        </div>
      )}
      {c.isEditing && (
        <MessagingDialog
          type={type}
          initial={c.initial}
          exposure={context.exposure}
          onSave={c.onSave}
          onClose={c.onCloseEdit}
        />
      )}
    </ChannelCard>
  )
}
