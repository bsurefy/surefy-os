// SPDX-License-Identifier: AGPL-3.0-only
import { useTranslations } from 'next-intl'

import type { ProviderCardDto } from '@surefy/contracts'
import { ProviderChip } from '@surefy/ui/components/DataDisplay'

import { getChipStatus, getDaysUntil, getProviderName } from '../../Vault.utils'

/** One chip per provider: Connected, Error with its reason, Rate limited, Key expires in N days, Not connected. */
export default function ProviderCards({
  cards,
  now,
}: Readonly<{ cards: ProviderCardDto[]; now: number }>) {
  const t = useTranslations('vault.providers')
  const tErrors = useTranslations('errors')

  const statusLabel = (card: ProviderCardDto): string => {
    if (card.status === 'expiring' && card.expiresAt) {
      return t('status.expiring', { days: Math.max(getDaysUntil(card.expiresAt, now), 0) })
    }
    return t(`status.${card.status}`)
  }

  return (
    <ul className="flex flex-wrap gap-3" aria-label={t('cardsLabel')}>
      {cards.map((card) => (
        <li key={card.providerKey} className="flex flex-col gap-1">
          <ProviderChip
            name={getProviderName(card.providerKey)}
            status={getChipStatus(card.status)}
            statusLabel={statusLabel(card)}
          />
          {card.statusReasonCode && (card.status === 'error' || card.status === 'rate_limited') && (
            <span className="text-caption text-muted-foreground max-w-64">
              {tErrors(card.statusReasonCode)}
            </span>
          )}
          {card.fallbackInUse && (
            <span className="text-caption text-warning">{t('fallbackInUse')}</span>
          )}
          {card.status !== 'not_connected' && (
            <span className="text-caption text-muted-foreground">
              {t('cardCounts', {
                keys: card.keyCount,
                models: card.modelCount,
              })}
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}
