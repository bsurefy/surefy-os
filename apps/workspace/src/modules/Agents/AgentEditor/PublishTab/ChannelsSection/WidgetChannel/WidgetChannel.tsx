// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { AppWindow } from 'lucide-react'

import { Button } from '@surefy/ui/primitives/button'

import ChannelCard, { ChannelExposure, QueuedChannel } from '../ChannelCard'
import LiveChannel from '../LiveChannel'
import EmbedCodeDialog from './EmbedCodeDialog'
import { useWidgetChannelController } from './WidgetChannel.controller'
import WidgetDialog from './WidgetDialog'

import type { WidgetChannelProps } from './WidgetChannel.types'

/** The website widget: the websites it loads on, how it looks, and its embed code. */
export default function WidgetChannel(props: Readonly<WidgetChannelProps>) {
  const c = useWidgetChannelController(props)
  const { t } = c
  const { channel, request, context, onWidgetTokenChange } = props
  const name = t('names.widget')

  const summary = c.summary && (
    <div className="flex flex-col gap-1">
      <ChannelExposure type="widget" exposure={context.exposure} />
      <p className="text-body text-muted-foreground">
        {t('widget.origins', { origins: c.summary.origins.join(', ') })}
      </p>
      <p className="text-body text-muted-foreground">{c.summary.look}</p>
    </div>
  )

  return (
    <ChannelCard icon={AppWindow} name={t('widget.name')} help={t('widget.help')} status={c.status}>
      {channel && (
        <LiveChannel
          channel={channel}
          name={name}
          context={context}
          onEdit={c.onEdit}
          onWidgetTokenChange={onWidgetTokenChange}
        >
          {summary}
        </LiveChannel>
      )}
      {!channel && request && (
        <QueuedChannel
          name={name}
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
            {t('widget.setUp')}
          </Button>
        </div>
      )}
      {c.isEditing && (
        <WidgetDialog
          config={c.config}
          exposure={context.exposure}
          onSave={c.onSave}
          onClose={c.onCloseEdit}
        />
      )}
      {c.snippet && (
        <EmbedCodeDialog
          snippet={c.snippet}
          onDone={() => {
            onWidgetTokenChange(null)
          }}
        />
      )}
    </ChannelCard>
  )
}
