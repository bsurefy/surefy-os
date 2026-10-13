// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'

import { connectionQueries } from '@/api/connections'
import { ROUTES } from '@/constants/routes'
import type { ConnectionDto } from '@surefy/contracts'
import { ErrorState } from '@surefy/ui/components/Feedback'
import { Button } from '@surefy/ui/primitives/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@surefy/ui/primitives/dialog'
import { Skeleton } from '@surefy/ui/primitives/skeleton'
import { getErrorMessage } from '@surefy/web-core/errors'

import { getImpactSummary } from '../ConnectionsSettings.utils'

const SKELETON_ROWS = 3

/** Agents open their page; the other dependents are listed by name (flows have no page yet). */
function getDependentHref(type: string, orgSlug: string, id: string) {
  if (type === 'agent') return ROUTES.workspace.agent(orgSlug, id)
  return null
}

/** What uses a connection, by name: agents, flows, knowledge sources and channels. */
export default function UsedByDialog({
  orgId,
  connection,
  onClose,
}: Readonly<{ orgId: string; connection: ConnectionDto; onClose: () => void }>) {
  const t = useTranslations('settings.connections.usedBy')
  const tErrors = useTranslations('errors')
  const { orgSlug } = useParams<{ orgSlug: string }>()
  const impact = useQuery(connectionQueries.impact(orgId, connection.id))
  const summary = impact.data ? getImpactSummary(impact.data) : null

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('title', { name: connection.name })}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          {impact.isPending && (
            <div className="flex flex-col gap-2" aria-busy>
              {Array.from({ length: SKELETON_ROWS }, (_, index) => (
                <Skeleton key={index} className="h-5 w-2/3" />
              ))}
            </div>
          )}
          {impact.error && (
            <ErrorState
              title={t('loadError')}
              message={getErrorMessage(impact.error, tErrors)}
              onRetry={() => void impact.refetch()}
            />
          )}
          {summary?.total === 0 && <p className="text-muted-foreground text-body">{t('none')}</p>}
          {summary?.groups.map((group) => (
            <section key={group.type} aria-label={t(`types.${group.type}`, { count: group.count })}>
              <h3 className="text-label text-muted-foreground mb-1">
                {t.has(`types.${group.type}`)
                  ? t(`types.${group.type}`, { count: group.count })
                  : t('types.other', { type: group.type, count: group.count })}
              </h3>
              <ul className="flex flex-col gap-1">
                {group.items.map(({ id, name }) => {
                  const href = getDependentHref(group.type, orgSlug, id)
                  return (
                    <li key={id} className="text-body">
                      {href ? (
                        <Link href={href} className="text-primary hover:underline">
                          {name}
                        </Link>
                      ) : (
                        name
                      )}
                    </li>
                  )
                })}
              </ul>
              {group.more > 0 && (
                <p className="text-caption text-muted-foreground mt-1">
                  {t('more', { count: group.more })}
                </p>
              )}
            </section>
          ))}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            {t('close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
