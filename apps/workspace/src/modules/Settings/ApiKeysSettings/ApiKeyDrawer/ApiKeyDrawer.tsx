// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import Link from 'next/link'

import { StatusPill } from '@surefy/ui/components/DataDisplay'
import { Banner } from '@surefy/ui/components/Feedback'
import { SidePanel } from '@surefy/ui/components/Overlay'
import { Button } from '@surefy/ui/primitives/button'
import { Skeleton } from '@surefy/ui/primitives/skeleton'

import { useApiKeyDrawerController } from './ApiKeyDrawer.controller'

const STATUS_TONE = { active: 'success', expired: 'warning', revoked: 'neutral' } as const

import type { ApiKeyDrawerProps } from './ApiKeyDrawer.types'

/**
 * A key's detail: name (renameable), the start of the key, permissions with descriptions, who
 * created it and when, expiry, last use with the caller's address, and the agents that use it.
 */
export default function ApiKeyDrawer({
  orgId,
  apiKey,
  canManage,
  onClose,
  onRename,
  onRevoke,
  onCreateReplacement,
}: Readonly<ApiKeyDrawerProps>) {
  const c = useApiKeyDrawerController(orgId, apiKey)
  const { t, tScopes } = c
  const isActive = c.status !== 'revoked'

  return (
    <SidePanel
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={apiKey.name}
      description={
        <span className="text-code font-mono">
          {t('drawer.keyStart', { prefix: apiKey.keyPrefix })}
        </span>
      }
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <Button variant="link" asChild>
            <Link href={c.auditLogHref}>{t('drawer.auditLog')}</Link>
          </Button>
          {canManage && isActive && (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onRename}>
                {t('actions.rename')}
              </Button>
              <Button variant="destructive" onClick={onRevoke}>
                {t('drawer.revoke')}
              </Button>
            </div>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {c.status === 'expired' && (
          <Banner
            tone="warning"
            title={t('drawer.expired.title')}
            description={t('drawer.expired.description')}
            action={
              canManage ? (
                <Button variant="secondary" size="sm" onClick={onCreateReplacement}>
                  {t('drawer.expired.create')}
                </Button>
              ) : undefined
            }
          />
        )}
        {c.status === 'revoked' && (
          <Banner
            tone="info"
            title={t('drawer.revoked.title', {
              date: apiKey.revokedAt ? c.formatDate(apiKey.revokedAt) : '',
            })}
            description={t('drawer.revoked.description')}
          />
        )}
        <dl className="flex flex-col gap-4">
          <Row label={t('columns.status')}>
            <StatusPill
              label={c.status === 'expired' ? t('expiredTag') : t(`status.${c.status}`)}
              tone={STATUS_TONE[c.status]}
            />
          </Row>
          <Row label={t('columns.permissions')}>
            <ul className="flex flex-col gap-2">
              {apiKey.scopes.map((scope) => (
                <li key={scope} className="flex flex-col">
                  <span className="font-medium">
                    {tScopes.has(`${scope}.name`) ? tScopes(`${scope}.name`) : scope}
                  </span>
                  {tScopes.has(`${scope}.description`) && (
                    <span className="text-caption text-muted-foreground">
                      {tScopes(`${scope}.description`)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Row>
          <Row label={t('columns.createdBy')}>
            {t('drawer.createdByValue', {
              name: apiKey.createdBy?.name ?? t('formerMember'),
              date: c.formatDate(apiKey.createdAt),
            })}
          </Row>
          <Row label={t('columns.expires')}>
            {apiKey.expiresAt ? c.formatDate(apiKey.expiresAt) : t('never')}
          </Row>
          <Row label={t('columns.lastUsed')}>
            {apiKey.lastUsedAt
              ? t('drawer.lastUsedValue', {
                  when: c.formatRelative(apiKey.lastUsedAt),
                  address: apiKey.lastUsedIp ?? t('drawer.unknownAddress'),
                })
              : t('neverUsed')}
          </Row>
          {isActive && (
            <Row label={t('drawer.usedBy')}>
              {c.isUsageLoading && <Skeleton className="h-5 w-40" />}
              {c.usageError && (
                <span className="flex flex-wrap items-center gap-2">
                  {t('drawer.usedByError')}
                  <Button variant="link" size="sm" onClick={c.retryUsage}>
                    {t('drawer.retry')}
                  </Button>
                </span>
              )}
              {!c.isUsageLoading &&
                !c.usageError &&
                c.usedBy.length === 0 &&
                t('drawer.usedByNone')}
              {c.usedBy.length > 0 && (
                <ul className="flex flex-col gap-1">
                  {c.usedBy.map((agent) => (
                    <li key={agent.id}>
                      <Link href={c.agentHref(agent.id)} className="text-primary underline">
                        {agent.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Row>
          )}
        </dl>
      </div>
    </SidePanel>
  )
}

function Row({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="text-body">{children}</dd>
    </div>
  )
}
