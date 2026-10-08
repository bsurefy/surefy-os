// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Ban, Plus, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import type { AgentGuard } from '@surefy/contracts'
import { Field } from '@surefy/ui/components/Forms'
import { Section } from '@surefy/ui/components/Layout'
import { Button } from '@surefy/ui/primitives/button'
import { Input } from '@surefy/ui/primitives/input'

type BlockedAction = AgentGuard['blockedActions'][number]

interface BlockedActionsSectionProps {
  blocked: readonly BlockedAction[]
  isReadOnly: boolean
  onAdd: (action: string) => void
  onRemove: (blockedId: string) => void
}

/** Actions this agent may never take, whatever the organization allows. */
export default function BlockedActionsSection({
  blocked,
  isReadOnly,
  onAdd,
  onRemove,
}: Readonly<BlockedActionsSectionProps>) {
  const t = useTranslations('agents.editor.guard.blocked')
  const [action, setAction] = useState('')

  const add = () => {
    onAdd(action)
    setAction('')
  }

  return (
    <Section title={t('title')} description={t('description')}>
      <div className="flex flex-col gap-4">
        {blocked.length === 0 ? (
          <p className="text-body text-muted-foreground">{t('empty')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {blocked.map((item) => (
              <li
                key={item.id}
                className="border-border flex items-center gap-3 rounded-lg border px-3 py-2"
              >
                <Ban aria-hidden className="text-destructive size-4 shrink-0" />
                <span className="text-body text-foreground min-w-0 flex-1 truncate">
                  {item.match.action}
                </span>
                {!isReadOnly && (
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={X}
                    aria-label={t('remove', { action: item.match.action })}
                    onClick={() => {
                      onRemove(item.id)
                    }}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
        {!isReadOnly && (
          <form
            className="flex items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              add()
            }}
          >
            <Field label={t('add.label')} description={t('add.help')} className="flex-1">
              <Input
                autoComplete="off"
                placeholder={t('add.placeholder')}
                value={action}
                onChange={(event) => {
                  setAction(event.target.value)
                }}
              />
            </Field>
            <Button type="submit" variant="secondary" icon={Plus} disabled={action.trim() === ''}>
              {t('add.submit')}
            </Button>
          </form>
        )}
      </div>
    </Section>
  )
}
