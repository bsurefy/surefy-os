// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Bot, Plus, X } from 'lucide-react'

import { IconTile } from '@surefy/ui/components/DataDisplay'
import { Field } from '@surefy/ui/components/Forms'
import { Section } from '@surefy/ui/components/Layout'
import { Button } from '@surefy/ui/primitives/button'
import { Input } from '@surefy/ui/primitives/input'
import { Textarea } from '@surefy/ui/primitives/textarea'

import { useInstructionsTabController } from './InstructionsTab.controller'

import type { InstructionsTabProps } from './InstructionsTab.types'

/**
 * Instructions: name, description, the briefing, tone and conversation starters, next to a live
 * preview of the agent as people see it in Chat.
 */
export default function InstructionsTab(props: Readonly<InstructionsTabProps>) {
  const c = useInstructionsTabController(props)
  const { t } = c
  const { agent, isReadOnly } = props

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex flex-col gap-6">
        <Section title={t('about.title')}>
          <div className="flex flex-col gap-4">
            <Field label={t('name.label')} error={c.nameError}>
              <Input
                value={c.name}
                maxLength={120}
                readOnly={isReadOnly}
                onChange={(event) => {
                  c.onNameChange(event.target.value)
                }}
              />
            </Field>
            <Field
              label={t('descriptionField.label')}
              description={t('descriptionField.help')}
              optionalLabel={t('optional')}
            >
              <Textarea
                value={c.description}
                maxLength={1000}
                readOnly={isReadOnly}
                rows={2}
                onChange={(event) => {
                  c.onDescriptionChange(event.target.value)
                }}
              />
            </Field>
          </div>
        </Section>
        <Section title={t('briefing.title')} description={t('briefing.description')}>
          <Field label={t('briefing.label')} isLabelHidden>
            <Textarea
              value={c.instructions}
              maxLength={c.instructionsMaxLength}
              readOnly={isReadOnly}
              rows={12}
              placeholder={t('briefing.placeholder')}
              onChange={(event) => {
                c.onInstructionsChange(event.target.value)
              }}
            />
          </Field>
          <p className="text-caption text-muted-foreground mt-1.5 text-right tabular-nums">
            {t('briefing.count', { count: c.instructions.length, max: c.instructionsMaxLength })}
          </p>
        </Section>
        <Section title={t('tone.title')}>
          <Field label={t('tone.label')} description={t('tone.help')} optionalLabel={t('optional')}>
            <Input
              value={c.tone}
              maxLength={200}
              readOnly={isReadOnly}
              placeholder={t('tone.placeholder')}
              onChange={(event) => {
                c.onToneChange(event.target.value)
              }}
            />
          </Field>
        </Section>
        <Section
          title={t('starters.title')}
          description={t('starters.description')}
          actions={
            isReadOnly ? undefined : (
              <Button
                variant="secondary"
                size="sm"
                icon={Plus}
                disabled={!c.canAddStarter}
                onClick={c.onAddStarter}
              >
                {t('starters.add')}
              </Button>
            )
          }
        >
          {c.starters.length === 0 ? (
            <p className="text-body text-muted-foreground">{t('starters.empty')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {c.starters.map((starter, index) => (
                <li key={index} className="flex items-center gap-2">
                  <Input
                    aria-label={t('starters.item', { number: index + 1 })}
                    value={starter}
                    maxLength={200}
                    readOnly={isReadOnly}
                    onChange={(event) => {
                      c.onStarterChange(index, event.target.value)
                    }}
                  />
                  {!isReadOnly && (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={X}
                      aria-label={t('starters.remove', { number: index + 1 })}
                      onClick={() => {
                        c.onRemoveStarter(index)
                      }}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
      <aside aria-label={t('preview.label')} className="lg:sticky lg:top-6 lg:self-start">
        <Section title={t('preview.title')} description={t('preview.description')}>
          <div className="flex flex-col items-center gap-3 text-center">
            <IconTile icon={Bot} size="lg" />
            <div className="flex flex-col gap-1">
              <p className="text-h3 text-foreground">{c.name.trim() || agent.name}</p>
              {c.description.trim() !== '' && (
                <p className="text-body text-muted-foreground">{c.description}</p>
              )}
            </div>
            {c.previewStarters.length > 0 && (
              <ul className="flex w-full flex-col gap-2">
                {c.previewStarters.map((starter) => (
                  <li
                    key={starter}
                    className="border-border text-body text-foreground-secondary rounded-lg border px-3 py-2 text-left"
                  >
                    {starter}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Section>
      </aside>
    </div>
  )
}
