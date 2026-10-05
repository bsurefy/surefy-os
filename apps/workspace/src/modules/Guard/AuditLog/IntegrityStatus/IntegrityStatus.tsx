// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react'

import { Banner } from '@surefy/ui/components/Feedback'
import { Button } from '@surefy/ui/primitives/button'

import { useIntegrityStatusController } from './IntegrityStatus.controller'

const STATE_ICON = {
  ok: { Icon: ShieldCheck, tone: 'text-success' },
  mismatch: { Icon: ShieldAlert, tone: 'text-destructive' },
  unverified: { Icon: ShieldQuestion, tone: 'text-muted-foreground' },
} as const

interface IntegrityStatusProps {
  orgId: string
  onOpenEntry: (entryId: string) => void
}

/**
 * The chain's integrity: a status line with "Verify now", and a destructive banner when an entry
 * no longer matches its chain. The log stays readable either way.
 */
export default function IntegrityStatus({ orgId, onOpenEntry }: Readonly<IntegrityStatusProps>) {
  const c = useIntegrityStatusController(orgId)
  const { t, status } = c
  if (!status) return null

  const isMismatch = status.state === 'mismatch'
  const { Icon, tone } = STATE_ICON[status.state]
  const mismatch = status.mismatch

  return (
    <div className="flex flex-col gap-3">
      {isMismatch && (
        <Banner
          tone="destructive"
          title={t('mismatch.title')}
          description={t('mismatch.description')}
          action={
            mismatch ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  onOpenEntry(mismatch.entryId)
                }}
              >
                {t('mismatch.viewEntry')}
              </Button>
            ) : undefined
          }
        />
      )}
      <div className="text-caption text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex items-center gap-1.5" role="status">
          <Icon aria-hidden className={`size-4 ${tone}`} />
          {t(`state.${c.lastVerified ? status.state : 'unverified'}`, {
            time: c.lastVerified ?? '',
          })}
        </span>
        <span>{t('sealed', { count: status.sealedCount })}</span>
        {status.unsealedCount > 0 && <span>{t('sealing', { count: status.unsealedCount })}</span>}
        {c.lastCheckpoint && <span>{t('checkpoint', { time: c.lastCheckpoint })}</span>}
        <Button variant="link" size="sm" onClick={c.onVerify} isLoading={c.isVerifying}>
          {t('verify')}
        </Button>
      </div>
    </div>
  )
}
