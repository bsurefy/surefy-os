// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { BookOpen, BookX, X } from 'lucide-react'
import Link from 'next/link'

import { toRoute } from '@/modules/Workspace'
import { EmptyState, IconTile, StatusPill } from '@surefy/ui/components/DataDisplay'
import { ErrorState } from '@surefy/ui/components/Feedback'
import { Combobox, Field, SwitchField } from '@surefy/ui/components/Forms'
import { Section } from '@surefy/ui/components/Layout'
import { Button } from '@surefy/ui/primitives/button'

import { useKnowledgeTabController } from './KnowledgeTab.controller'

import type { KnowledgeTabProps } from './KnowledgeTab.types'

/** Knowledge: the knowledge bases the agent searches, with "Cite sources" and "Only answer from knowledge". */
export default function KnowledgeTab(props: Readonly<KnowledgeTabProps>) {
  const c = useKnowledgeTabController(props)
  const { t } = c
  const { isReadOnly } = props

  if (c.errorMessage) {
    return (
      <ErrorState
        title={t('loadError')}
        message={c.errorMessage}
        reference={c.errorReference}
        onRetry={c.refetch}
      />
    )
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Section title={t('bases.title')} description={t('bases.description')}>
        <div className="flex flex-col gap-4">
          {c.attached.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              headingLevel={3}
              title={t('empty.title')}
              description={t('empty.description')}
              secondaryAction={
                !c.isLoading && !c.hasManageableBases ? (
                  <Button asChild variant="secondary">
                    <Link href={toRoute(c.knowledgeHref)}>{t('empty.create')}</Link>
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {c.attached.map(({ id, base }) => (
                <li
                  key={id}
                  className="border-border flex items-center gap-3 rounded-lg border px-3 py-2"
                >
                  <IconTile
                    icon={base ? BookOpen : BookX}
                    size="sm"
                    tone={base ? 'primary' : 'warning'}
                  />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="text-body text-foreground truncate font-medium">
                      {base?.name ?? t('unavailable.name')}
                    </span>
                    <span className="text-caption text-muted-foreground">
                      {base
                        ? t('sourceCount', { count: base.sourceCount })
                        : t('unavailable.description')}
                    </span>
                  </div>
                  {base?.isLocalOnly && <StatusPill tone="success" label={t('localOnly')} />}
                  {!isReadOnly && (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={X}
                      aria-label={t('remove', { name: base?.name ?? t('unavailable.name') })}
                      onClick={() => {
                        c.onRemove(id)
                      }}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
          {!isReadOnly && (
            <Field label={t('add.label')}>
              <Combobox
                options={c.addOptions}
                labels={{
                  placeholder: t('add.placeholder'),
                  search: t('add.search'),
                  empty: t('add.empty'),
                  loading: t('add.loading'),
                }}
                value={null}
                onValueChange={c.onAdd}
                isLoading={c.isLoading}
                isDisabled={!c.canAdd}
              />
            </Field>
          )}
        </div>
      </Section>
      <Section title={t('answers.title')}>
        <div className="flex flex-col gap-4">
          <SwitchField
            label={t('cite.label')}
            description={t('cite.help')}
            checked={c.citeSources}
            onCheckedChange={c.onCiteSourcesChange}
            disabled={isReadOnly}
          />
          <SwitchField
            label={t('only.label')}
            description={t('only.help')}
            checked={c.onlyFromKnowledge}
            onCheckedChange={c.onOnlyFromKnowledgeChange}
            disabled={isReadOnly}
          />
        </div>
      </Section>
    </div>
  )
}
