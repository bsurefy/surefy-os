// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useTranslations } from 'next-intl'

import type { PiiType } from '@surefy/contracts'
import { Banner } from '@surefy/ui/components/Feedback'
import { Combobox, Field } from '@surefy/ui/components/Forms'
import { Section } from '@surefy/ui/components/Layout'
import { Button } from '@surefy/ui/primitives/button'
import { Textarea } from '@surefy/ui/primitives/textarea'

import { useTryItController } from './TryIt.controller'

/**
 * The live "Try it" box: the masked text and the types found, as the organization's filters (or a
 * team's) would treat the sample before it left for a cloud model.
 */
export default function TryIt({
  version,
  typeName,
}: Readonly<{
  /** Changes when a type's action changes, so the result follows. */
  version: string
  typeName: (entry: { piiType: PiiType; customLabel: string | null }) => string
}>) {
  const c = useTryItController(version)
  const { t } = c
  const tActions = useTranslations('guard.dataFilters.actions')

  return (
    <Section title={t('title')} description={t('description')}>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <Field label={t('text')}>
            <Textarea
              rows={6}
              value={c.text}
              onChange={(event) => {
                c.onTextChange(event.target.value)
              }}
            />
          </Field>
          <Field label={t('as')}>
            <Combobox
              options={[{ value: '', label: t('asOrganization') }, ...c.teamOptions]}
              value={c.teamId ?? ''}
              onValueChange={(value) => {
                c.onTeamChange(value === '' || value === null ? null : value)
              }}
              labels={{
                placeholder: t('asOrganization'),
                search: t('as'),
                empty: t('asOrganization'),
              }}
            />
          </Field>
        </div>
        <div
          aria-live="polite"
          aria-busy={c.isRunning || undefined}
          className="flex flex-col gap-3"
        >
          {c.errorMessage && (
            <p
              role="alert"
              className="text-body text-destructive flex flex-wrap items-center gap-2"
            >
              {t('error')}
              <Button variant="link" size="sm" onClick={c.retry}>
                {t('retry')}
              </Button>
            </p>
          )}
          {c.isEmpty && <p className="text-body text-foreground-secondary">{t('empty')}</p>}
          {!c.isEmpty && c.result && (
            <>
              {c.result.blocked && (
                <Banner
                  tone="warning"
                  title={t('blocked.title')}
                  description={t('blocked.description')}
                />
              )}
              <div className="flex flex-col gap-1">
                <span className="text-label text-foreground">{t('masked')}</span>
                <pre
                  aria-label={t('masked')}
                  className="bg-surface-2 text-code border-border max-h-48 overflow-auto rounded-lg border p-3 whitespace-pre-wrap"
                >
                  {c.result.maskedText}
                </pre>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-label text-foreground">{t('found')}</span>
                {c.result.findings.length === 0 ? (
                  <p className="text-body text-foreground-secondary">{t('none')}</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {c.result.findings.map((finding) => (
                      <li
                        key={`${finding.piiType}:${finding.customLabel ?? ''}`}
                        className="text-body"
                      >
                        {t('finding', {
                          type: typeName(finding),
                          count: finding.count,
                          action: tActions(finding.action),
                        })}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
          {!c.isEmpty && !c.result && c.isRunning && (
            <p className="text-body text-foreground-secondary">{t('running')}</p>
          )}
        </div>
      </div>
    </Section>
  )
}
