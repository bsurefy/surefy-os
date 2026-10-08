// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Plus, SearchX, Shield, ShieldCheck } from 'lucide-react'

import {
  DataTableSearch,
  DataTableToolbar,
  EmptyState,
  IconTile,
} from '@surefy/ui/components/DataDisplay'
import { ErrorState } from '@surefy/ui/components/Feedback'
import { SelectInput } from '@surefy/ui/components/Forms'
import { PageHeader } from '@surefy/ui/components/Layout'
import { LoadMore } from '@surefy/ui/components/Navigation'
import { Button } from '@surefy/ui/primitives/button'

import GuardTabs from '../GuardTabs'
import { GuardrailChangeDialog } from './GuardrailDialogs'
import { ANY, SCOPE_FILTERS, STATUS_FILTERS, TYPE_FILTERS } from './Guardrails.constants'
import { useGuardrailsController } from './Guardrails.controller'
import GuardrailSheet from './GuardrailSheet'
import GuardrailsTable from './GuardrailsTable'

/**
 * Guard › Guardrails (design/workspace/guard.md): every approval rule, threshold override, blocked
 * action, action limit and content filter of the organization and its teams, plus the agent and
 * flow rules and the data filters, read-only. A row opens the guardrail sheet; Add guardrail opens
 * it with a type picker. Builders see the table without a way to change it.
 */
export default function Guardrails() {
  const c = useGuardrailsController()
  const { t, filters } = c

  const emptyState = c.hasFilters ? (
    <EmptyState
      icon={SearchX}
      title={t('noResults.title')}
      description={t('noResults.description')}
      actionLabel={t('noResults.clear')}
      onAction={c.onClearFilters}
    />
  ) : (
    <EmptyState
      icon={ShieldCheck}
      title={t('empty.title')}
      description={t('empty.description')}
      actionLabel={c.canManage ? t('empty.action') : undefined}
      onAction={c.canManage ? c.onAddRule : undefined}
    />
  )

  const typeOptions = TYPE_FILTERS.map((value) => ({
    value,
    label: value === ANY ? t('filters.anyType') : t(`types.${value}`),
  }))
  const scopeOptions = SCOPE_FILTERS.map((value) => ({
    value,
    label: value === ANY ? t('filters.anyScope') : t(`scopes.${value}`),
  }))
  const statusOptions = STATUS_FILTERS.map((value) => ({
    value,
    label: value === ANY ? t('filters.anyStatus') : t(`filters.${value}`),
  }))

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        icon={<IconTile icon={Shield} />}
        tabs={<GuardTabs active="guardrails" />}
        actions={
          c.canManage ? (
            <Button icon={Plus} onClick={c.onAddRule}>
              {t('add')}
            </Button>
          ) : undefined
        }
      />
      <DataTableToolbar>
        <DataTableSearch
          label={t('search.label')}
          placeholder={t('search.placeholder')}
          value={filters.q}
          onValueChange={c.onSearchChange}
        />
        <SelectInput
          aria-label={t('filters.type')}
          options={typeOptions}
          value={filters.type}
          onValueChange={(type) => void c.onFiltersChange({ type })}
          className="w-48"
        />
        <SelectInput
          aria-label={t('filters.scope')}
          options={scopeOptions}
          value={filters.scope}
          onValueChange={(scope) => void c.onFiltersChange({ scope })}
          className="w-40"
        />
        <SelectInput
          aria-label={t('filters.status')}
          options={statusOptions}
          value={filters.status}
          onValueChange={(status) => void c.onFiltersChange({ status })}
          className="w-40"
        />
      </DataTableToolbar>
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
            <GuardrailsTable
              rows={c.rows}
              isLoading={c.isLoading}
              sort={c.sortState}
              onSortChange={c.onSortChange}
              emptyState={emptyState}
              canToggle={c.canToggle}
              onOpen={c.onOpenRule}
              onToggle={c.onToggle}
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
      {c.openRule && (
        <GuardrailSheet
          ruleId={c.openRule}
          row={c.openRow}
          canManage={c.canManage}
          canLock={c.canLock}
          onOpenRule={(id) => void c.onFiltersChange({ rule: id })}
          onClose={c.onCloseRule}
        />
      )}
      {c.turningOff && (
        <GuardrailChangeDialog
          guardrailId={c.turningOff.id}
          title={t('turnOff.title', { name: c.turningOff.name })}
          description={t('turnOff.description')}
          confirmLabel={t('turnOff.confirm')}
          error={c.turnOffError}
          onClose={c.onCloseTurnOff}
          onConfirm={c.onConfirmTurnOff}
        />
      )}
    </div>
  )
}
