// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Building2, User, Users, X } from 'lucide-react'

import { IconTile } from '@surefy/ui/components/DataDisplay'
import { Banner, ErrorState } from '@surefy/ui/components/Feedback'
import { Combobox, Field, SelectInput } from '@surefy/ui/components/Forms'
import { Section } from '@surefy/ui/components/Layout'
import { Button } from '@surefy/ui/primitives/button'

import { useAudienceSectionController } from './AudienceSection.controller'

import type { AudienceSectionProps } from './AudienceSection.types'

const ROW_ICONS = { organization: Building2, team: Users, user: User } as const

/** Who can use it: everyone, teams and people, with what each may do. Saved as soon as it changes. */
export default function AudienceSection(props: Readonly<AudienceSectionProps>) {
  const c = useAudienceSectionController(props)
  const { t } = c

  return (
    <Section title={t('title')} description={t('description')}>
      {c.loadError ? (
        <ErrorState
          title={t('loadError')}
          message={c.loadError}
          reference={c.loadReference}
          onRetry={c.refetch}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {c.saveError && (
            <Banner
              tone="destructive"
              isAnnounced
              title={t('saveError')}
              description={c.saveError}
            />
          )}
          {!c.isLoading && c.rows.length === 0 && (
            <p className="text-body text-muted-foreground">{t('nobody')}</p>
          )}
          {c.rows.length > 0 && (
            <ul className="flex flex-col gap-2">
              {c.rows.map((row) => (
                <li
                  key={row.key}
                  className="border-border flex items-center gap-3 rounded-lg border px-3 py-2"
                >
                  <IconTile icon={ROW_ICONS[row.kind]} size="sm" tone="primary" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="text-body text-foreground truncate font-medium">
                      {row.label}
                    </span>
                    {row.description && (
                      <span className="text-caption text-muted-foreground truncate">
                        {row.description}
                      </span>
                    )}
                  </div>
                  {row.kind === 'organization' ? (
                    <span className="text-caption text-muted-foreground">{t('level.use')}</span>
                  ) : (
                    <SelectInput
                      aria-label={t('levelFor', { name: row.label })}
                      options={[
                        { value: 'use', label: t('level.use') },
                        { value: 'edit', label: t('level.edit') },
                      ]}
                      value={row.level}
                      onValueChange={(level) => {
                        c.onLevelChange(row.key, level)
                      }}
                      isDisabled={c.isReadOnly}
                      className="w-36"
                    />
                  )}
                  {!c.isReadOnly && (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={X}
                      aria-label={t('remove', { name: row.label })}
                      onClick={() => {
                        c.onRemove(row.key)
                      }}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
          {!c.isReadOnly && (
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
                isDisabled={c.isSaving}
              />
            </Field>
          )}
        </div>
      )}
    </Section>
  )
}
