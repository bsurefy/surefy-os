// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { FlaskConical, RotateCcw, SendHorizontal, Square } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { EmptyState } from '@surefy/ui/components/DataDisplay'
import { Banner } from '@surefy/ui/components/Feedback'
import { Section } from '@surefy/ui/components/Layout'
import { Button } from '@surefy/ui/primitives/button'
import { Textarea } from '@surefy/ui/primitives/textarea'

import type { TestChatProps } from './TestChat.types'

const textOf = (message: TestChatProps['messages'][number]) =>
  message.parts.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('')

/** The sandbox conversation: what was asked, what the agent answered, and the box to ask more. */
export default function TestChat({
  messages,
  starters,
  activity,
  isSaving,
  notSaved,
  isReadOnly,
  failureMessage,
  composer,
}: Readonly<TestChatProps>) {
  const t = useTranslations('agents.editor.test.chat')
  const isBusy = activity !== 'idle'
  const lastMessage = messages.at(-1)
  const isWaitingForText =
    isBusy && (lastMessage?.role !== 'assistant' || textOf(lastMessage) === '')

  return (
    <Section
      title={t('title')}
      description={t('description')}
      actions={
        composer.canClear && (
          <Button variant="ghost" size="sm" icon={RotateCcw} onClick={composer.onClear}>
            {t('clear')}
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {messages.length === 0 ? (
          <div className="flex flex-col gap-3">
            <EmptyState
              icon={FlaskConical}
              headingLevel={3}
              title={t('empty.title')}
              description={t('empty.description')}
            />
            {starters.length > 0 && !isReadOnly && (
              <div className="flex flex-col items-center gap-2">
                <p className="text-caption text-muted-foreground">{t('starters')}</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {starters.map((starter) => (
                    <Button
                      key={starter}
                      variant="secondary"
                      size="sm"
                      disabled={isBusy || isSaving}
                      onClick={() => {
                        composer.onStarter(starter)
                      }}
                    >
                      {starter}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <ol aria-label={t('title')} aria-live="polite" className="flex flex-col gap-3">
            {messages.map((message) => {
              const text = textOf(message)
              if (text === '') return null
              const isPerson = message.role === 'user'
              return (
                <li
                  key={message.id}
                  className={`flex flex-col gap-1 ${isPerson ? 'items-end' : 'items-start'}`}
                >
                  <span className="text-caption text-muted-foreground">
                    {isPerson ? t('you') : t('agent')}
                  </span>
                  <p
                    className={`text-body max-w-[85%] rounded-lg px-3 py-2 whitespace-pre-wrap ${
                      isPerson ? 'bg-primary-soft text-primary-soft-foreground' : 'bg-surface-2'
                    }`}
                  >
                    {text}
                  </p>
                </li>
              )
            })}
            {isWaitingForText && (
              <li className="text-caption text-muted-foreground">{t('working')}</li>
            )}
          </ol>
        )}
        {failureMessage && (
          <Banner tone="destructive" isAnnounced title={t('failed')} description={failureMessage} />
        )}
        {notSaved && (
          <Banner
            tone="warning"
            isAnnounced
            title={t('notSaved.title')}
            description={t('notSaved.description')}
          />
        )}
        {isReadOnly ? (
          <p className="text-body text-muted-foreground">{t('readOnly')}</p>
        ) : (
          <form
            className="flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              composer.onSend()
            }}
          >
            <Textarea
              aria-label={t('label')}
              placeholder={t('placeholder')}
              rows={3}
              maxLength={20_000}
              value={composer.text}
              onChange={(event) => {
                composer.onTextChange(event.target.value)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault()
                  composer.onSend()
                }
              }}
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-caption text-muted-foreground">
                {isSaving ? t('saving') : t('sandbox')}
              </p>
              {isBusy ? (
                <Button type="button" variant="secondary" icon={Square} onClick={composer.onStop}>
                  {t('stop')}
                </Button>
              ) : (
                <Button type="submit" icon={SendHorizontal} disabled={!composer.canSend}>
                  {t('send')}
                </Button>
              )}
            </div>
          </form>
        )}
      </div>
    </Section>
  )
}
