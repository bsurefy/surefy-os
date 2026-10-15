// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useTranslations } from 'next-intl'

import {
  KNOWLEDGE_CONNECTOR_CONNECTION_PROVIDERS,
  KNOWLEDGE_CONNECTOR_PROVIDERS,
} from '@surefy/contracts'
import type { KnowledgeConnectorProvider } from '@surefy/contracts'
import { MonoTile } from '@surefy/ui/components/DataDisplay'
import { Button } from '@surefy/ui/primitives/button'

import { CONNECTOR_TILES } from '../SourcesTab.constants'
import { useProviderName } from '../SourcesTab.hooks'

function Row({
  tile,
  name,
  description,
  action,
  isActionNamed = false,
  isDisabled,
  onAction,
}: Readonly<{
  tile: string
  name: string
  description: string
  action: string
  /** "Connect" alone is ambiguous: screen readers hear "Connect Google Drive". */
  isActionNamed?: boolean
  isDisabled: boolean
  onAction: () => void
}>) {
  return (
    <li className="border-border flex items-center gap-3 rounded-lg border px-3 py-2.5">
      <MonoTile size="md">{tile}</MonoTile>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-body font-medium">{name}</span>
        <span className="text-caption text-muted-foreground truncate">{description}</span>
      </div>
      <Button variant="secondary" size="sm" disabled={isDisabled} onClick={onAction}>
        {action}
        {isActionNamed && <span className="sr-only"> {name}</span>}
      </Button>
    </li>
  )
}

/**
 * Next to the dropzone: add a link, or connect Google Drive or Notion. A connector already in use
 * says how many sources sync through it; adding another picks more folders.
 */
export default function ConnectorsCard({
  isDisabled,
  sourceCounts,
  onAddLink,
  onConnect,
}: Readonly<{
  isDisabled: boolean
  /** Connector sources of this base, by app. */
  sourceCounts: Readonly<Record<KnowledgeConnectorProvider, number>>
  onAddLink: () => void
  onConnect: (provider: KnowledgeConnectorProvider) => void
}>) {
  const t = useTranslations('knowledge.detail.sources.connectors')
  const providerName = useProviderName()

  return (
    <div className="border-border bg-surface flex flex-col gap-2.5 rounded-xl border p-4">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-section-title">{t('title')}</h3>
        <p className="text-caption text-muted-foreground">{t('description')}</p>
      </div>
      <ul className="flex flex-col gap-2">
        <Row
          tile="URL"
          name={t('link.name')}
          description={t('link.description')}
          action={t('link.action')}
          isDisabled={isDisabled}
          onAction={onAddLink}
        />
        {KNOWLEDGE_CONNECTOR_PROVIDERS.map((provider) => {
          const count = sourceCounts[provider]
          return (
            <Row
              key={provider}
              tile={CONNECTOR_TILES[provider]}
              name={providerName(KNOWLEDGE_CONNECTOR_CONNECTION_PROVIDERS[provider])}
              description={count > 0 ? t('synced', { count }) : t(`pick.${provider}`)}
              action={count > 0 ? t(`addMore.${provider}`) : t('connect')}
              isActionNamed
              isDisabled={isDisabled}
              onAction={() => {
                onConnect(provider)
              }}
            />
          )
        })}
      </ul>
      <p className="text-caption text-muted-foreground mt-auto">{t('hint')}</p>
    </div>
  )
}
