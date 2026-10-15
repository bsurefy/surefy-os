// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Columns2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { ModelList } from '@/modules/Vault'
import type { UsableModelDto } from '@surefy/contracts'
import { cn } from '@surefy/ui/lib/utils'
import { Button } from '@surefy/ui/primitives/button'
import { Popover, PopoverContent, PopoverTrigger } from '@surefy/ui/primitives/popover'

export interface CompareControlProps {
  /** The models answer B can use: not the chat's own model; local ones only in a private chat. */
  options: readonly UsableModelDto[]
  /** Answer B's model while Compare is on. */
  model: UsableModelDto | undefined
  isOn: boolean
  isDisabled: boolean
  /** The message has images: models that cannot read them are disabled. */
  requiresVision: boolean
  onModelChange: (modelKey: string) => void
  onStop: () => void
}

/**
 * Compare (chat.md §2): answers the next message with a second model as well, side by side. Pick
 * the model for answer B; the chat's own model gives answer A. Turning it off sends plain messages.
 */
export default function CompareControl({
  options,
  model,
  isOn,
  isDisabled,
  requiresVision,
  onModelChange,
  onStop,
}: Readonly<CompareControlProps>) {
  const t = useTranslations('chat.thread.composer.compare')
  const [isOpen, setIsOpen] = useState(false)
  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="secondary"
          size="sm"
          disabled={isDisabled}
          aria-label={t('label')}
          aria-pressed={isOn}
          className={cn('h-8 max-w-48 gap-1.5 rounded-lg px-2', isOn && 'text-primary')}
        >
          <Columns2 aria-hidden className="size-4 shrink-0" />
          <span className="text-label hidden truncate sm:inline">
            {isOn && model ? t('versus', { model: model.displayName }) : t('short')}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <p className="text-caption text-muted-foreground px-3 pt-3">{t('description')}</p>
        <ModelList
          models={options}
          isPending={false}
          value={isOn ? (model?.modelKey ?? null) : null}
          requiresVision={requiresVision}
          onSelect={(modelKey) => {
            onModelChange(modelKey)
            setIsOpen(false)
          }}
        />
        {isOn && (
          <div className="border-border border-t p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={() => {
                onStop()
                setIsOpen(false)
              }}
            >
              {t('stop')}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
