// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Pencil, Trash2 } from 'lucide-react'
import { useFormatter } from 'next-intl'

import { KNOWLEDGE_CHUNKING_PRESETS } from '@surefy/contracts'
import type { KnowledgeBaseDto, KnowledgeChunkingPreset } from '@surefy/contracts'
import { Banner } from '@surefy/ui/components/Feedback'
import { Field, SelectInput, SwitchField } from '@surefy/ui/components/Forms'
import { Section } from '@surefy/ui/components/Layout'
import { Button } from '@surefy/ui/primitives/button'

import { useSettingsTabController } from './SettingsTab.controller'
import ReindexConfirmDialog from '../KnowledgeBaseDetail/ReindexConfirmDialog'

/**
 * Knowledge base › Settings: name, embedding model (Admin; changing it re-indexes, T2), chunking
 * preset (re-indexes, T2), "Local models only", and Delete (T3). Per-base retention (Enterprise)
 * joins when the table has the column.
 */
export default function SettingsTab({
  base,
  onRename,
  onDelete,
}: Readonly<{ base: KnowledgeBaseDto; onRename: () => void; onDelete: () => void }>) {
  const c = useSettingsTabController(base)
  const { t } = c
  const format = useFormatter()

  const reindex = base.reindex
  return (
    <div className="flex flex-col gap-8">
      <Section title={t('general.title')} description={t('general.description')}>
        <dl className="text-body grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt className="text-muted-foreground">{t('general.name')}</dt>
          <dd>{base.name}</dd>
          <dt className="text-muted-foreground">{t('general.descriptionLabel')}</dt>
          <dd>{base.description ?? '—'}</dd>
        </dl>
        <Button variant="secondary" icon={Pencil} className="self-start" onClick={onRename}>
          {t('general.rename')}
        </Button>
      </Section>
      <Section title={t('embedding.title')} description={t('embedding.description')}>
        {reindex && (
          <Banner
            tone="info"
            title={t('embedding.running', {
              model: reindex.target?.displayName ?? base.embeddingModel?.displayName ?? '',
            })}
            description={t('embedding.progress', {
              done: format.number(reindex.documentsDone),
              total: format.number(reindex.documentsTotal),
            })}
            action={
              <Button
                variant="secondary"
                size="sm"
                isLoading={c.isCancelling}
                onClick={c.onCancelReindex}
              >
                {t('embedding.cancel')}
              </Button>
            }
          />
        )}
        {c.canChooseModel ? (
          <Field
            label={t('embedding.model')}
            description={
              base.isLocalOnly && !c.hasLocalModel ? t('embedding.noLocalModel') : undefined
            }
          >
            <SelectInput
              options={c.modelOptions}
              value={base.embeddingModel?.modelKey}
              placeholder={t('embedding.none')}
              isDisabled={c.isReindexing || c.modelOptions.length === 0}
              onValueChange={c.onModelChange}
            />
          </Field>
        ) : (
          <div className="flex flex-col gap-1">
            <span className="text-body">
              {base.embeddingModel?.displayName ?? t('embedding.none')}
            </span>
            <span className="text-caption text-muted-foreground">{t('embedding.adminOnly')}</span>
          </div>
        )}
      </Section>
      <Section title={t('chunking.title')} description={t('chunking.description')}>
        <Field label={t('chunking.label')}>
          <SelectInput<KnowledgeChunkingPreset>
            options={KNOWLEDGE_CHUNKING_PRESETS.map((value) => ({
              value,
              label: t(`chunking.presets.${value}`),
            }))}
            value={base.chunkingPreset}
            isDisabled={c.isReindexing || base.embeddingModel === null}
            onValueChange={c.onPresetChange}
          />
        </Field>
      </Section>
      <Section title={t('privacy.title')}>
        <SwitchField
          label={t('privacy.localOnly')}
          description={t('privacy.localOnlyHelp')}
          checked={base.isLocalOnly}
          disabled={c.isUpdating}
          onCheckedChange={c.onLocalOnlyChange}
        />
      </Section>
      <Section title={t('danger.title')} description={t('danger.description')}>
        <Button variant="destructive" icon={Trash2} className="self-start" onClick={onDelete}>
          {t('danger.delete')}
        </Button>
      </Section>
      {c.pending && (
        <ReindexConfirmDialog
          orgId={c.orgId}
          baseId={base.id}
          kind={c.pending.kind}
          modelKey={c.pending.kind === 'model' ? c.pending.modelKey : undefined}
          onConfirm={c.onConfirmChange}
          onClose={c.onCancelChange}
        />
      )}
    </div>
  )
}
