// SPDX-License-Identifier: AGPL-3.0-only
import { ArrowDown, ArrowUp, X } from 'lucide-react'
import { useTranslations } from 'next-intl'

import type { FallbackEntryDto } from '@surefy/contracts'
import { StatusPill } from '@surefy/ui/components/DataDisplay'
import type { StatusTone } from '@surefy/ui/components/DataDisplay'
import { Button } from '@surefy/ui/primitives/button'

const STATE_TONE: Record<FallbackEntryDto['state'], StatusTone> = {
  ready: 'success',
  disabled: 'neutral',
  unavailable: 'warning',
  missing: 'destructive',
}

export interface FallbackOrderProps {
  entries: FallbackEntryDto[]
  onMove: (from: number, to: number) => void
  onRemove: (modelKey: string) => void
}

/** The fallback order: the first entry is tried first; each can move up or down or leave the list. */
export default function FallbackOrder({ entries, onMove, onRemove }: Readonly<FallbackOrderProps>) {
  const t = useTranslations('vault.fallback')

  return (
    <ol className="flex flex-col gap-2" aria-label={t('orderLabel')}>
      {entries.map((entry, index) => {
        const name = entry.displayName ?? entry.modelKey
        return (
          <li
            key={entry.modelKey}
            className="border-border bg-surface flex items-center gap-3 rounded-lg border px-3 py-2"
          >
            <span aria-hidden className="text-label text-muted-foreground w-5">
              {index + 1}
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-body truncate font-medium">{name}</span>
              {entry.state !== 'ready' && (
                <span className="text-caption text-muted-foreground">
                  {t(`stateHelp.${entry.state}`)}
                </span>
              )}
            </div>
            <StatusPill label={t(`state.${entry.state}`)} tone={STATE_TONE[entry.state]} />
            <Button
              variant="ghost"
              size="icon-sm"
              icon={ArrowUp}
              aria-label={t('moveUp', { name })}
              disabled={index === 0}
              onClick={() => {
                onMove(index, index - 1)
              }}
            />
            <Button
              variant="ghost"
              size="icon-sm"
              icon={ArrowDown}
              aria-label={t('moveDown', { name })}
              disabled={index === entries.length - 1}
              onClick={() => {
                onMove(index, index + 1)
              }}
            />
            <Button
              variant="ghost"
              size="icon-sm"
              icon={X}
              aria-label={t('remove', { name })}
              onClick={() => {
                onRemove(entry.modelKey)
              }}
            />
          </li>
        )
      })}
    </ol>
  )
}
