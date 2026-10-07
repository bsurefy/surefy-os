// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Download, ScrollText, SearchX, Shield } from 'lucide-react'

import {
  AUDIT_ACTIONS,
  AUDIT_ACTOR_TYPES,
  AUDIT_OUTCOMES,
  AUDIT_TARGET_TYPES,
} from '@surefy/contracts'
import {
  DataTableSearch,
  DataTableToolbar,
  EmptyState,
  IconTile,
} from '@surefy/ui/components/DataDisplay'
import { ErrorState } from '@surefy/ui/components/Feedback'
import { Combobox, Field, SelectInput } from '@surefy/ui/components/Forms'
import { PageHeader } from '@surefy/ui/components/Layout'
import { FilterChips, LoadMore } from '@surefy/ui/components/Navigation'
import { Button } from '@surefy/ui/primitives/button'

import AuditEntryDetail from './AuditEntryDetail'
import AuditExportDialog from './AuditExportDialog'
import { ANY, AUDIT_DATE_RANGES } from './AuditLog.constants'
import { useAuditLogController } from './AuditLog.controller'
import { useAuditLabels } from './AuditLog.hooks'
import AuditTable from './AuditTable'
import IntegrityStatus from './IntegrityStatus'

/**
 * Guard › Audit log: who did what, when, to which object, with the result; filters, the entry
 * detail with its signature, the chain's integrity and the export (Enterprise).
 */
export default function AuditLog() {
  const c = useAuditLogController()
  const { t } = c
  const labels = useAuditLabels()

  /** A single-value filter: "Any …" first, then the values; "any" clears it. */
  const anyOr = <T extends string>(
    anyLabel: string,
    values: readonly T[],
    label: (value: T) => string,
  ): { value: T | typeof ANY; label: string }[] => [
    { value: ANY, label: anyLabel },
    ...values.map((value) => ({ value, label: label(value) })),
  ]
  const fromAny = <T extends string>(value: T | null): Exclude<T, typeof ANY> | null =>
    value === null || value === ANY ? null : (value as Exclude<T, typeof ANY>)

  const emptyState = c.hasFilters ? (
    <EmptyState
      icon={SearchX}
      title={t('noResults.title')}
      description={t('noResults.description')}
      actionLabel={t('noResults.clear')}
      onAction={c.onClearFilters}
    />
  ) : (
    <EmptyState icon={ScrollText} title={t('empty.title')} description={t('empty.description')} />
  )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        icon={<IconTile icon={Shield} />}
        actions={
          <Button
            variant="secondary"
            icon={Download}
            onClick={() => {
              c.onExportOpenChange(true)
            }}
          >
            {t('export.open')}
          </Button>
        }
      />
      <IntegrityStatus orgId={c.orgId} onOpenEntry={c.onOpenEntry} />
      <DataTableToolbar>
        <DataTableSearch
          label={t('search.label')}
          placeholder={t('search.placeholder')}
          value={c.filters.q}
          onValueChange={c.onSearchChange}
        />
        <Field label={t('filters.person')} isLabelHidden className="w-44">
          <Combobox
            options={[{ value: ANY, label: t('filters.anyPerson') }, ...c.personOptions]}
            labels={{
              placeholder: t('filters.anyPerson'),
              search: t('filters.personSearch'),
              empty: t('filters.personEmpty'),
            }}
            value={c.filters.person ?? ANY}
            onValueChange={(value) => {
              c.onFiltersChange({ person: fromAny(value) })
            }}
          />
        </Field>
        <Field label={t('filters.action')} isLabelHidden className="w-52">
          <Combobox
            options={anyOr(t('filters.anyAction'), Object.values(AUDIT_ACTIONS), labels.action)}
            labels={{
              placeholder: t('filters.anyAction'),
              search: t('filters.actionSearch'),
              empty: t('filters.actionEmpty'),
            }}
            value={c.filters.action ?? ANY}
            onValueChange={(value) => {
              c.onFiltersChange({ action: fromAny(value) })
            }}
          />
        </Field>
        <Field label={t('filters.object')} isLabelHidden className="w-44">
          <Combobox
            options={anyOr(t('filters.anyObject'), AUDIT_TARGET_TYPES, labels.objectType)}
            labels={{
              placeholder: t('filters.anyObject'),
              search: t('filters.objectSearch'),
              empty: t('filters.objectEmpty'),
            }}
            value={c.filters.object ?? ANY}
            onValueChange={(value) => {
              c.onFiltersChange({ object: fromAny(value) })
            }}
          />
        </Field>
        <SelectInput
          aria-label={t('filters.range')}
          options={AUDIT_DATE_RANGES.map((range) => ({
            value: range,
            label: t(`filters.ranges.${range}`),
          }))}
          value={c.filters.range}
          onValueChange={(range) => {
            c.onFiltersChange({ range: range })
          }}
          className="w-40"
        />
      </DataTableToolbar>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <FilterChips
          label={t('filters.actorType')}
          options={anyOr(t('filters.anyActorType'), AUDIT_ACTOR_TYPES, (type) =>
            t(`actorTypes.${type}`),
          )}
          value={c.filters.actor ?? ANY}
          onValueChange={(value) => {
            c.onFiltersChange({ actor: fromAny(value) })
          }}
        />
        <FilterChips
          label={t('filters.result')}
          options={anyOr(t('filters.anyResult'), AUDIT_OUTCOMES, (outcome) =>
            t(`outcomes.${outcome}`),
          )}
          value={c.filters.result ?? ANY}
          onValueChange={(value) => {
            c.onFiltersChange({ result: fromAny(value) })
          }}
        />
      </div>
      <section aria-busy={c.isLoading || undefined}>
        {c.errorMessage ? (
          <ErrorState
            title={t('loadError')}
            message={c.errorMessage}
            reference={c.errorReference}
            onRetry={c.refetch}
          />
        ) : (
          <>
            <AuditTable
              rows={c.rows}
              isLoading={c.isLoading}
              emptyState={emptyState}
              getEntryHref={c.getEntryHref}
            />
            <LoadMore
              label={t('loadMore')}
              onLoadMore={c.onLoadMore}
              isLoading={c.isLoadingMore}
              hasMore={c.hasMore}
            />
          </>
        )}
      </section>
      {c.openEntryId && (
        <AuditEntryDetail
          key={c.openEntryId}
          orgId={c.orgId}
          entryId={c.openEntryId}
          row={c.openEntryRow}
          onClose={c.onCloseEntry}
          onPrevious={c.onPreviousEntry}
          onNext={c.onNextEntry}
        />
      )}
      {c.isExportOpen && (
        <AuditExportDialog
          orgId={c.orgId}
          filters={c.filters}
          onClose={() => {
            c.onExportOpenChange(false)
          }}
        />
      )}
    </div>
  )
}
