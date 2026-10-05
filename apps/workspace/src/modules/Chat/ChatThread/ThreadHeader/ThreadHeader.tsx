// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Download, Lock, MoreHorizontal, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { getProviderName, ModelSelector } from '@/modules/Vault'
import { DataLocationBadge } from '@surefy/ui/components/DataDisplay'
import { Button } from '@surefy/ui/primitives/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@surefy/ui/primitives/dropdown-menu'

import KnowledgeScope from '../KnowledgeScope'
import { isLocalModel } from '../ThreadView/ThreadView.settings'

import type { ThreadViewController } from '../ThreadView/ThreadView.controller'

/**
 * The thread's header (chat.md §1): the model picker, the knowledge scope, where the data goes and
 * the "⋯" menu with private chat, export and delete.
 */
export default function ThreadHeader({ c }: Readonly<{ c: ThreadViewController }>) {
  const t = useTranslations('chat.thread.header')
  const { settings } = c
  const model = settings.currentModel
  const isLocal = isLocalModel(model)

  return (
    <header className="flex flex-wrap items-center gap-2">
      <ModelSelector
        value={settings.settings.modelKey}
        onValueChange={settings.onModelChange}
        requiresVision={c.attachments.hasImages}
      />
      <KnowledgeScope
        orgId={c.orgId}
        scope={settings.settings.knowledgeScope}
        selectedIds={settings.settings.knowledgeBaseIds}
        onChange={settings.onScopeChange}
      />
      {model && (
        <DataLocationBadge
          location={isLocal ? 'local' : 'provider'}
          label={
            isLocal
              ? t('location.local')
              : t('location.provider', { provider: getProviderName(model.providerKey) })
          }
        />
      )}
      {settings.settings.isPrivate && (
        <span className="text-label bg-surface-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5">
          <Lock aria-hidden className="size-3" />
          {t('private.badge')}
        </span>
      )}
      <div className="ml-auto">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={t('menu')}>
              <MoreHorizontal aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuCheckboxItem
              checked={settings.settings.isPrivate}
              disabled={!settings.canBePrivate && !settings.settings.isPrivate}
              onCheckedChange={settings.onPrivateChange}
            >
              <span className="flex flex-col">
                <span>{t('private.toggle')}</span>
                {!settings.canBePrivate && !settings.settings.isPrivate && (
                  <span className="text-caption text-muted-foreground">
                    {t('private.needsLocal')}
                  </span>
                )}
              </span>
            </DropdownMenuCheckboxItem>
            {c.chat && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={c.exportDialog.onOpen}>
                  <Download aria-hidden />
                  {t('export')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={c.onDeleteChat}>
                  <Trash2 aria-hidden />
                  {t('delete')}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
