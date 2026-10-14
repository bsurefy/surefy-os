// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useInfiniteQuery } from '@tanstack/react-query'
import { Eye } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { modelQueries } from '@/api/models'
import { getProviderName } from '@/modules/Vault'
import type { ChatMessageDto, SharedChatDetailDto } from '@surefy/contracts'
import { Banner, toast } from '@surefy/ui/components/Feedback'
import { Button } from '@surefy/ui/primitives/button'

import { fromDto, getMessageText } from '../ChatThread.utils'
import AssistantMessage from '../Messages/AssistantMessage'
import UserMessage from '../Messages/UserMessage'
import ModelSwitchDivider from '../ModelSwitchDivider'
import SourcePreview from '../SourcePreview'

import type { SourcePreviewTarget } from '../SourcePreview'

const MODELS_LIMIT = 100
const noop = () => {
  // view only: the thread's actions do nothing here
}

export interface SharedThreadProps {
  orgId: string
  orgSlug: string
  chatId: string
  shared: SharedChatDetailDto
  history: readonly ChatMessageDto[]
  hasEarlier: boolean
  isLoadingEarlier: boolean
  onLoadEarlier: () => void
}

/**
 * A chat someone shared with the person (chat.md §3): view only, with the banner "Shared by Maya ·
 * view only" and no composer. Answers can be read, copied and their sources opened.
 */
export default function SharedThread({
  orgId,
  orgSlug,
  chatId,
  shared,
  history,
  hasEarlier,
  isLoadingEarlier,
  onLoadEarlier,
}: Readonly<SharedThreadProps>) {
  const t = useTranslations('chat.thread')
  const tList = useTranslations('chat.list')
  const [preview, setPreview] = useState<SourcePreviewTarget | null>(null)
  const models = useInfiniteQuery(modelQueries.usable(orgId, { type: 'chat', limit: MODELS_LIMIT }))
  const rows = history.map(fromDto)
  const sharer = shared.sharedBy ?? shared.owner

  const modelName = (modelKey: string | null) =>
    models.data?.pages.flatMap((page) => page.items).find((model) => model.modelKey === modelKey)
      ?.displayName ??
    modelKey?.split('/').at(-1) ??
    null

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="border-border flex h-14 shrink-0 items-center gap-2.5 border-b px-4 md:px-5">
        <h1 className="text-section-title min-w-0 truncate">
          {shared.title === '' ? tList('untitled') : shared.title}
        </h1>
        <span className="text-caption bg-surface-2 text-foreground-secondary inline-flex h-[1.375rem] shrink-0 items-center gap-1 rounded-full px-2 font-medium">
          <Eye aria-hidden className="size-3" />
          {t('shared.badge')}
        </span>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-6 pb-4 md:px-6">
        <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6 pb-4">
          <Banner
            tone="info"
            title={sharer ? t('shared.banner', { name: sharer.name }) : t('shared.bannerUnknown')}
            description={t('shared.description')}
          />
          {hasEarlier && (
            <Button
              variant="secondary"
              size="sm"
              className="self-center"
              isLoading={isLoadingEarlier}
              onClick={onLoadEarlier}
            >
              {t('loadEarlier')}
            </Button>
          )}
          {rows.map((row) => {
            if (row.role === 'user') {
              return (
                <UserMessage
                  key={row.id}
                  row={row}
                  isEditing={false}
                  canEdit={false}
                  onEdit={noop}
                  onCancelEdit={noop}
                  onSaveEdit={noop}
                />
              )
            }
            const switchPart = row.parts.find((part) => part.kind === 'switch')
            return (
              <div key={row.id} className="flex flex-col gap-6">
                {switchPart?.kind === 'switch' && (
                  <ModelSwitchDivider
                    modelName={modelName(switchPart.toModelKey) ?? switchPart.toModelKey}
                  />
                )}
                <AssistantMessage
                  row={row}
                  modelName={shared.agent?.name ?? modelName(row.modelKey)}
                  providerName={
                    row.modelKey ? getProviderName(row.modelKey.split('/')[0] ?? '') : null
                  }
                  isLocal={row.dataLocation === 'local'}
                  isLast={false}
                  isBusy={false}
                  isReadOnly
                  failure={{
                    orgSlug,
                    canManageVault: false,
                    hasLocalModel: false,
                    onUseLocalModel: noop,
                  }}
                  onOpenSource={(index) => {
                    const source = row.sources.find((candidate) => candidate.index === index)
                    setPreview({
                      messageId: row.id,
                      title: source?.title ?? t('preview.untitled'),
                      index,
                    })
                  }}
                  onCopy={() => {
                    void navigator.clipboard.writeText(getMessageText(row)).then(() => {
                      toast.success(t('actions.copied'))
                    })
                  }}
                  onRegenerate={noop}
                  onContinue={noop}
                  onRate={noop}
                />
              </div>
            )
          })}
        </div>
      </div>
      {preview && (
        <SourcePreview
          orgId={orgId}
          orgSlug={orgSlug}
          chatId={chatId}
          target={preview}
          onClose={() => {
            setPreview(null)
          }}
        />
      )}
    </div>
  )
}
