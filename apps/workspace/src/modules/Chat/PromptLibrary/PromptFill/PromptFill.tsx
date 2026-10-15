// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { fillPromptVariables, PROMPT_VARIABLE_VALUE_MAX_LENGTH } from '@surefy/contracts'
import type { PromptDto } from '@surefy/contracts'
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
import { Input } from '@surefy/ui/primitives/input'
import { Label } from '@surefy/ui/primitives/label'

export interface PromptFillProps {
  prompt: PromptDto
  /** The prompt's text with every filled variable replaced. */
  onSubmit: (text: string) => void
  onClose: () => void
}

/** Asks for each `{variable}` of a prompt before it goes into the composer. */
export default function PromptFill({ prompt, onSubmit, onClose }: Readonly<PromptFillProps>) {
  const t = useTranslations('chat.prompts.fill')
  const [values, setValues] = useState<Record<string, string>>({})
  const filled = Object.fromEntries(
    Object.entries(values).filter(([, value]) => value.trim() !== ''),
  )

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('title', { title: prompt.title })}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <form
          id="prompt-fill-form"
          onSubmit={(event) => {
            event.preventDefault()
            onSubmit(fillPromptVariables(prompt.body, filled))
          }}
        >
          <DialogBody className="flex flex-col gap-4">
            {prompt.variables.map((name, position) => (
              <div key={name} className="flex flex-col gap-1.5">
                <Label htmlFor={`prompt-variable-${name}`}>{name}</Label>
                <Input
                  id={`prompt-variable-${name}`}
                  autoComplete="off"
                  autoFocus={position === 0}
                  maxLength={PROMPT_VARIABLE_VALUE_MAX_LENGTH}
                  value={values[name] ?? ''}
                  onChange={(event) => {
                    setValues((current) => ({ ...current, [name]: event.target.value }))
                  }}
                />
              </div>
            ))}
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" type="button" onClick={onClose}>
              {t('cancel')}
            </Button>
            <Button type="submit">{t('submit')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
