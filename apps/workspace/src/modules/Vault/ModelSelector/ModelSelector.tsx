// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useInfiniteQuery } from '@tanstack/react-query'
import { Check, ChevronDown } from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { modelQueries } from '@/api/models'
import { ROUTES } from '@/constants/routes'
import { PERMISSIONS } from '@surefy/contracts'
import type { ModelType, UsableModelDto } from '@surefy/contracts'
import { DataLocationBadge, MonoTile } from '@surefy/ui/components/DataDisplay'
import { cn } from '@surefy/ui/lib/utils'
import { Button } from '@surefy/ui/primitives/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@surefy/ui/primitives/command'
import { Popover, PopoverContent, PopoverTrigger } from '@surefy/ui/primitives/popover'
import { useCan, useCurrentOrgId } from '@surefy/web-core/access'

import { getProviderName, groupModels } from '../Vault.utils'

import type { ModelGroup } from '../Vault.utils'

const MODELS_LIMIT = 100
const GROUPS: readonly ModelGroup[] = ['local', 'provider', 'platform']

export interface ModelSelectorProps {
  /** The chosen model key; null shows the placeholder. */
  value: string | null
  onValueChange: (modelKey: string) => void
  type?: ModelType
  /** The message has images: models that cannot read them are disabled with the reason. */
  requiresVision?: boolean
  isDisabled?: boolean
  /** `compact`: a 32px trigger with the tile and the name only, for a toolbar. Default `default`. */
  variant?: 'default' | 'compact'
  className?: string
}

/**
 * The model picker Chat and Agents use: the models the person may use, grouped "On your server",
 * "Your API keys" and (Cloud) "Included with credits", each with where the data goes and its cost.
 * With no models it says what to do: Admins open Vault, everyone else asks an Admin.
 */
export default function ModelSelector({
  value,
  onValueChange,
  type = 'chat',
  requiresVision = false,
  isDisabled = false,
  variant = 'default',
  className,
}: Readonly<ModelSelectorProps>) {
  const t = useTranslations('vault.selector')
  const orgId = useCurrentOrgId()
  const { orgSlug } = useParams<{ orgSlug: string }>()
  const canManage = useCan(PERMISSIONS.VAULT_MANAGE)
  const [isOpen, setIsOpen] = useState(false)
  const query = useInfiniteQuery(modelQueries.usable(orgId, { type, limit: MODELS_LIMIT }))
  const models = query.data?.pages.flatMap((page) => page.items) ?? []
  const groups = groupModels(models)
  const selected = models.find((model) => model.modelKey === value)

  const itemCaption = (model: UsableModelDto) =>
    requiresVision && !model.supportsVision ? t('noVision') : t(`cost.${model.costTier}`)
  const originOf = (model: UsableModelDto) =>
    model.dataLocation === 'on_server' ? t('onServer') : getProviderName(model.providerKey)
  const origin = selected ? originOf(selected) : undefined
  const isCompact = variant === 'compact'

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'border-border bg-surface hover:bg-surface-2 focus-visible:ring-ring data-[state=open]:border-primary data-[state=open]:ring-ring/30 duration-fast flex max-w-full min-w-0 items-center rounded-lg border py-0 text-left transition-colors outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 data-[state=open]:ring-[3px]',
            isCompact ? 'h-8 gap-1.5 pr-2 pl-1' : 'h-[2.375rem] gap-2.5 pr-2.5 pl-1.5',
            className,
          )}
          disabled={isDisabled}
          aria-label={t('label')}
          title={isCompact ? origin : undefined}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
        >
          <MonoTile size="sm">{(selected?.displayName ?? '?').slice(0, 1).toUpperCase()}</MonoTile>
          <span className="flex min-w-0 flex-col">
            <span
              className={cn(
                'text-label truncate leading-[1.0625rem]',
                isCompact ? 'max-w-44 font-medium' : 'font-semibold',
              )}
            >
              {selected?.displayName ?? t('placeholder')}
            </span>
            {!isCompact && origin && (
              <span className="text-overline text-muted-foreground truncate leading-[0.875rem] font-normal tracking-normal normal-case">
                {origin}
              </span>
            )}
          </span>
          <ChevronDown aria-hidden className="text-muted-foreground size-3.5 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        {!query.isPending && models.length === 0 ? (
          <div className="flex flex-col gap-2 p-4">
            <p className="text-body font-medium">{t('none.title')}</p>
            <p className="text-caption text-muted-foreground">
              {canManage ? t('none.admin') : t('none.member')}
            </p>
            {canManage && (
              <Button variant="link" size="sm" asChild className="w-fit">
                <Link href={ROUTES.workspace.vault(orgSlug)}>{t('none.open')}</Link>
              </Button>
            )}
          </div>
        ) : (
          <Command>
            <CommandInput placeholder={t('search')} />
            <CommandList>
              <CommandEmpty>{t('empty')}</CommandEmpty>
              {GROUPS.filter((group) => groups[group].length > 0).map((group) => (
                <CommandGroup key={group} heading={t(`groups.${group}`)}>
                  {groups[group].map((model) => {
                    const isUnavailable = requiresVision && !model.supportsVision
                    return (
                      <CommandItem
                        key={model.modelKey}
                        value={`${model.displayName} ${getProviderName(model.providerKey)}`}
                        disabled={isUnavailable}
                        onSelect={() => {
                          onValueChange(model.modelKey)
                          setIsOpen(false)
                        }}
                      >
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate">{model.displayName}</span>
                          <span className="text-caption text-muted-foreground">
                            {itemCaption(model)}
                          </span>
                        </div>
                        <DataLocationBadge
                          location={model.dataLocation === 'on_server' ? 'local' : 'provider'}
                          label={
                            model.dataLocation === 'on_server'
                              ? t('location.local')
                              : t('location.provider', {
                                  provider: getProviderName(model.providerKey),
                                })
                          }
                        />
                        {model.modelKey === value && <Check aria-hidden className="size-4" />}
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  )
}
