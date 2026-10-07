// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Search, SearchX } from 'lucide-react'
import { useFormatter } from 'next-intl'

import { KNOWLEDGE_SEARCH_LIMITS } from '@surefy/contracts'
import type { KnowledgeBaseDto, KnowledgeTestPassageDto } from '@surefy/contracts'
import { EmptyState, StatusPill } from '@surefy/ui/components/DataDisplay'
import { Banner } from '@surefy/ui/components/Feedback'
import {
  Field,
  NumberInput,
  SelectInput,
  SliderInput,
  SwitchField,
} from '@surefy/ui/components/Forms'
import { Button } from '@surefy/ui/primitives/button'
import { Textarea } from '@surefy/ui/primitives/textarea'

import { useTestSearchController } from './TestSearchTab.controller'

/**
 * Knowledge base › Test search: ask a question and see the answer preview and the passages found,
 * with their relevance and whether they were used. Settings: minimum relevance, passages per
 * answer, and whose access the search runs with (you, or a team).
 */
export default function TestSearchTab({ base }: Readonly<{ base: KnowledgeBaseDto }>) {
  const c = useTestSearchController(base)
  const { t } = c
  const format = useFormatter()

  const renderPassage = (passage: KnowledgeTestPassageDto) => (
    <li key={passage.chunkId} className="border-border flex flex-col gap-2 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-body font-medium">{passage.documentTitle}</span>
        {passage.pageFrom && (
          <span className="text-caption text-muted-foreground">
            {t('passage.page', { page: passage.pageFrom })}
          </span>
        )}
        <span className="text-caption text-muted-foreground ml-auto">
          {t('passage.relevance', {
            percent: format.number(passage.relevance, { style: 'percent' }),
          })}
        </span>
        <StatusPill
          tone={passage.isUsed ? 'success' : 'neutral'}
          label={passage.isUsed ? t('passage.used') : t('passage.notUsed')}
        />
      </div>
      {passage.headingPath.length > 0 && (
        <span className="text-caption text-muted-foreground">
          {passage.headingPath.join(' › ')}
        </span>
      )}
      <p className="text-body whitespace-pre-wrap">{passage.content}</p>
      <span className="text-caption text-muted-foreground">
        {t('passage.source', { name: passage.sourceName })}
      </span>
    </li>
  )

  return (
    <div className="flex flex-col gap-6">
      {!c.canSearch && (
        <Banner tone="warning" title={t('noModel.title')} description={t('noModel.description')} />
      )}
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          c.onSubmit()
        }}
      >
        <Field label={t('question')} description={t('questionHelp')}>
          <Textarea
            rows={3}
            maxLength={KNOWLEDGE_SEARCH_LIMITS.questionMaxLength}
            value={c.question}
            onChange={(event) => {
              c.onQuestionChange(event.target.value)
            }}
            disabled={!c.canSearch}
          />
        </Field>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label={t('minRelevance')}>
            <SliderInput
              label={t('minRelevance')}
              min={0}
              max={100}
              step={5}
              suffix="%"
              value={c.minRelevancePercent}
              onValueChange={c.onMinRelevanceChange}
              isDisabled={!c.canSearch}
            />
          </Field>
          <Field label={t('passages')}>
            <NumberInput
              min={1}
              max={KNOWLEDGE_SEARCH_LIMITS.passagesMax}
              value={c.passages}
              onValueChange={c.onPassagesChange}
              disabled={!c.canSearch}
            />
          </Field>
          <Field label={t('searchAs.label')} description={t('searchAs.help')}>
            <SelectInput
              options={c.searchAsOptions}
              value={c.searchAs}
              onValueChange={c.onSearchAsChange}
              isDisabled={!c.canSearch}
            />
          </Field>
        </div>
        <SwitchField
          label={t('includeAnswer')}
          description={t('includeAnswerHelp')}
          checked={c.includeAnswer}
          onCheckedChange={c.onIncludeAnswerChange}
          disabled={!c.canSearch}
        />
        <Button
          type="submit"
          icon={Search}
          className="self-start"
          isLoading={c.isSearching}
          disabled={!c.canSearch || !c.isSubmittable}
        >
          {t('submit')}
        </Button>
      </form>
      {c.errorMessage && <Banner tone="destructive" title={c.errorMessage} isAnnounced />}
      {c.result && (
        <section aria-label={t('results')} className="flex flex-col gap-4">
          {c.result.notSearchedSourceCount > 0 && (
            <Banner
              tone="info"
              title={t('processing', { count: c.result.notSearchedSourceCount })}
            />
          )}
          {c.result.answerPreview && (
            <div className="border-border bg-surface-1 flex flex-col gap-2 rounded-lg border p-4">
              <h3 className="text-label font-medium">{t('answer')}</h3>
              <p className="text-body whitespace-pre-wrap">{c.result.answerPreview.text}</p>
              <span className="text-caption text-muted-foreground">
                {t('answerModel', { model: c.result.answerPreview.modelKey })}
              </span>
            </div>
          )}
          {c.result.passages.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title={t('noPassages.title')}
              description={t('noPassages.description')}
              headingLevel={3}
            />
          ) : (
            <>
              <h3 className="text-label font-medium">
                {t('found', { count: c.result.passages.length })}
              </h3>
              <ul className="flex flex-col gap-3">{c.result.passages.map(renderPassage)}</ul>
            </>
          )}
        </section>
      )}
    </div>
  )
}
