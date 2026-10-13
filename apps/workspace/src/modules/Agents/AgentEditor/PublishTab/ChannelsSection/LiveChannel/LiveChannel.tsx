// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import Link from 'next/link'

import { toRoute } from '@/modules/Workspace'
import { Banner } from '@surefy/ui/components/Feedback'
import { ConfirmDialog } from '@surefy/ui/components/Overlay'
import { Button } from '@surefy/ui/primitives/button'

import { useLiveChannelController } from './LiveChannel.controller'

import type { LiveChannelProps } from './LiveChannel.types'

/** A channel that exists: its state, what it is set up with, and what can be done with it. */
export default function LiveChannel(props: Readonly<LiveChannelProps>) {
  const c = useLiveChannelController(props)
  const { t } = c
  const { name, onEdit, children } = props
  const canEdit = onEdit !== undefined && !c.isWaiting && props.context.canManage

  return (
    <div className="flex flex-col gap-4">
      {c.isWaiting && (
        <Banner
          tone="info"
          title={t('waiting.title', { channel: name })}
          description={t('waiting.description')}
        />
      )}
      {c.isError && (
        <Banner
          tone="destructive"
          title={t('error.title', { channel: name })}
          description={c.reason}
          action={
            <Button asChild variant="secondary" size="sm">
              <Link href={toRoute(c.connectionsHref)}>{t('error.reconnect')}</Link>
            </Button>
          }
        />
      )}
      {c.isPaused && <p className="text-body text-muted-foreground">{t('pausedHelp')}</p>}
      {children}
      <div className="flex flex-wrap items-center gap-2">
        {c.canGetCode && (
          <Button size="sm" onClick={c.onGetCode} isLoading={c.isWorking}>
            {t('getCode')}
          </Button>
        )}
        {canEdit && (
          <Button size="sm" variant="secondary" onClick={onEdit}>
            {t('edit')}
          </Button>
        )}
        {c.canResume && (
          <Button size="sm" variant="secondary" onClick={c.onResume} isLoading={c.isWorking}>
            {c.isError ? t('retry') : t('resume')}
          </Button>
        )}
        {c.canPause && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              c.onConfirm('pause')
            }}
          >
            {t('pause')}
          </Button>
        )}
        {c.canNewCode && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              c.onConfirm('newCode')
            }}
          >
            {t('newCode')}
          </Button>
        )}
        {c.canWithdraw && (
          <Button size="sm" variant="secondary" onClick={c.onWithdraw} isLoading={c.isWorking}>
            {t('withdraw')}
          </Button>
        )}
        {c.canTurnOff && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              c.onConfirm('turnOff')
            }}
          >
            {t('turnOff')}
          </Button>
        )}
      </div>
      {c.confirming && (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) c.onCloseConfirm()
          }}
          tier="T2"
          tone={c.confirming === 'pause' ? 'primary' : 'destructive'}
          title={t(`confirm.${c.confirming}.title`, { channel: name })}
          description={t(`confirm.${c.confirming}.description`, { channel: name })}
          labels={{ confirm: t(`confirm.${c.confirming}.action`) }}
          error={c.confirmError}
          onConfirm={{ pause: c.onPause, turnOff: c.onTurnOff, newCode: c.onNewCode }[c.confirming]}
        />
      )}
    </div>
  )
}
