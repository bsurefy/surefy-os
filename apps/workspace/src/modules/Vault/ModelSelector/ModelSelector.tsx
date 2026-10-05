// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useInfiniteQuery } from '@tanstack/react-query'
import { Check, ChevronsUpDown } from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { modelQueries } from '@/api/models'
import { ROUTES } from '@/constants/routes'
import { PERMISSIONS } from '@surefy/contracts'
import type { ModelType, UsableModelDto } from '@surefy/contracts'
import { DataLocationBadge } from '@surefy/ui/components/DataDisplay'
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

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="secondary"
          className={className}
          disabled={isDisabled}
          aria-label={t('label')}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
        >
          <span className="truncate">{selected?.displayName ?? t('placeholder')}</span>
          <ChevronsUpDown aria-hidden className="size-4 shrink-0" />
        </Button>
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
