// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import type { ConnectionProviderDto } from '@surefy/contracts'
import { MonoTile } from '@surefy/ui/components/DataDisplay'
import { ErrorState } from '@surefy/ui/components/Feedback'
import { Input } from '@surefy/ui/primitives/input'
import { Skeleton } from '@surefy/ui/primitives/skeleton'

import { PROVIDER_GROUP_OF_KIND } from '../../ConnectionsSettings.constants'
import { getSignInMethods } from '../../ConnectionsSettings.utils'

const GROUP_ORDER = ['knowledge', 'channels', 'tools'] as const
const TILE_CHARS = 2
const SKELETON_CARDS = 4

export interface ChooseAppStepProps {
  providers: ConnectionProviderDto[]
  isLoading: boolean
  error: string | null
  onRetry: () => void
  providerName: (providerKey: string) => string
  onChoose: (provider: ConnectionProviderDto) => void
}

/** Step 1: cards grouped by use. An app whose sign-in is not set up on this install is disabled. */
export default function ChooseAppStep({
  providers,
  isLoading,
  error,
  onRetry,
  providerName,
  onChoose,
}: Readonly<ChooseAppStepProps>) {
  const t = useTranslations('settings.connections.add.app')
  const [search, setSearch] = useState('')

  if (error) {
    return <ErrorState title={t('loadError')} message={error} onRetry={onRetry} />
  }
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3" aria-busy>
        {Array.from({ length: SKELETON_CARDS }, (_, index) => (
          <Skeleton key={index} className="h-16 rounded-lg" />
        ))}
      </div>
    )
  }

  const query = search.trim().toLowerCase()
  const shown = providers.filter(
    (provider) => !query || providerName(provider.providerKey).toLowerCase().includes(query),
  )

  return (
    <div className="flex flex-col gap-4">
      <Input
        type="search"
        aria-label={t('search')}
        placeholder={t('search')}
        value={search}
        onChange={(event) => {
          setSearch(event.target.value)
        }}
      />
      {shown.length === 0 && <p className="text-muted-foreground text-body">{t('noMatch')}</p>}
      {GROUP_ORDER.map((group) => {
        const cards = shown.filter((provider) => PROVIDER_GROUP_OF_KIND[provider.kind] === group)
        if (cards.length === 0) return null
        return (
          <section key={group} aria-label={t(`groups.${group}`)} className="flex flex-col gap-2">
            <h3 className="text-label text-muted-foreground">{t(`groups.${group}`)}</h3>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {cards.map((provider) => {
                const isUsable = getSignInMethods(provider).length > 0
                const name = providerName(provider.providerKey)
                return (
                  <li key={provider.providerKey}>
                    <button
                      type="button"
                      disabled={!isUsable}
                      aria-label={name}
                      className="border-border bg-surface hover:bg-surface-2 flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => {
                        onChoose(provider)
                      }}
                    >
                      <MonoTile size="lg">{name.slice(0, TILE_CHARS)}</MonoTile>
                      <span className="flex min-w-0 flex-col">
                        <span className="text-body font-medium">{name}</span>
                        <span className="text-caption text-muted-foreground">
                          {isUsable ? t(`hints.${provider.providerKey}`) : t('notSetUp')}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
