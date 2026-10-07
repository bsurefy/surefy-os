// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Ellipsis, Eye, FolderOpen, Plus, RefreshCw, ScanText, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useFormatter, useLocale } from 'next-intl'

import { ROUTES } from '@/constants/routes'
import { toRoute } from '@/modules/Workspace'
import { KNOWLEDGE_FILE_LIMITS } from '@surefy/contracts'
import type { KnowledgeBaseDto, KnowledgeSourceDto } from '@surefy/contracts'
import {
  BulkActionBar,
  DataTable,
  DataTableSearch,
  DataTableToolbar,
  EmptyState,
  MonoTile,
} from '@surefy/ui/components/DataDisplay'
import type { DataTableColumn } from '@surefy/ui/components/DataDisplay'
import { Banner, ErrorState } from '@surefy/ui/components/Feedback'
import { FileDropzone, FileUploadList, formatFileSize } from '@surefy/ui/components/Forms'
import { FilterChips, LoadMore } from '@surefy/ui/components/Navigation'
import { Button } from '@surefy/ui/primitives/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@surefy/ui/primitives/dropdown-menu'

import SourcePreview from '../SourcePreview'
import AddLinkDialog from './AddLinkDialog'
import DuplicateFileDialog from './DuplicateFileDialog'
import RemoveSourcesDialog from './RemoveSourcesDialog'
import { ACCEPTED_FILES, SOURCE_STATUS_FILTERS } from './SourcesTab.constants'
import { useSourcesTabController } from './SourcesTab.controller'
import { canRetryWithOcr, getSourceKindCode, toSourceSort } from './SourcesTab.utils'
import SourceStatus from './SourceStatus'

import type { SourceStatusFilter } from './SourcesTab.constants'

const toSort = (sort: string) => ({ id: sort.replace(/^-/, ''), desc: sort.startsWith('-') })

/**
 * Knowledge base › Sources: add files (dropzone) and links, follow processing, see what failed and
 * why, and retry, re-index or remove (T2). People who can only search see the table.
 */
export default function SourcesTab({ base }: Readonly<{ base: KnowledgeBaseDto }>) {
  const c = useSourcesTabController(base)
  const { t, uploads } = c
  const locale = useLocale()
  const format = useFormatter()
  const { orgSlug } = useParams<{ orgSlug: string }>()

  const columns: DataTableColumn<KnowledgeSourceDto>[] = [
    {
      id: 'name',
      header: t('columns.name'),
      isSortable: true,
      isHideable: false,
      cell: (source) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <MonoTile size="lg">{getSourceKindCode(source)}</MonoTile>
          <div className="flex min-w-0 flex-col">
            <span className="text-body truncate font-medium">{source.name}</span>
            {source.link && (
              <span className="text-caption text-muted-foreground truncate">{source.link.url}</span>
            )}
          </div>
        </div>
      ),
    },
    { id: 'type', header: t('columns.type'), cell: (source) => t(`types.${source.type}`) },
    {
      id: 'sizeBytes',
      header: t('columns.size'),
      isSortable: true,
      align: 'end',
      cell: (source) =>
        source.sizeBytes === null ? '—' : formatFileSize(source.sizeBytes, locale),
    },
    {
      id: 'passages',
      header: t('columns.passages'),
      align: 'end',
      cell: (source) => format.number(source.passageCount),
    },
    {
      id: 'status',
      header: t('columns.status'),
      cell: (source) => <SourceStatus source={source} />,
    },
    {
      id: 'addedBy',
      header: t('columns.addedBy'),
      cell: (source) => source.addedBy?.name ?? '—',
    },
  ]

  const rowActions = (source: KnowledgeSourceDto) => {
    const attention = ['failed', 'partially_failed', 'paused'].includes(source.status)
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('actions.label', { name: source.name })}
          >
            <Ellipsis aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={toRoute(c.getSourceHref(source.id))}>
              <Eye aria-hidden />
              {t('actions.preview')}
            </Link>
          </DropdownMenuItem>
          {c.canManage && attention && (
            <DropdownMenuItem
              onSelect={() => {
                c.onRetry(source, false)
              }}
            >
              <RefreshCw aria-hidden />
              {t('actions.retry')}
            </DropdownMenuItem>
          )}
          {c.canManage && canRetryWithOcr(source) && (
            <DropdownMenuItem
              onSelect={() => {
                c.onRetry(source, true)
              }}
            >
              <ScanText aria-hidden />
              {t('actions.retryOcr')}
            </DropdownMenuItem>
          )}
          {c.canManage && source.type !== 'file' && (
            <DropdownMenuItem
              onSelect={() => {
                c.onSync(source)
              }}
            >
              <RefreshCw aria-hidden />
              {t('actions.sync')}
            </DropdownMenuItem>
          )}
          {c.canManage && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => {
                  c.onRemove([source])
                }}
              >
                <Trash2 aria-hidden />
                {t('actions.remove')}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  const emptyState = c.hasFilters ? (
    <EmptyState
      icon={FolderOpen}
      title={t('noResults.title')}
      description={t('noResults.description')}
      actionLabel={t('noResults.clear')}
      onAction={c.onClearFilters}
    />
  ) : (
    <EmptyState
      icon={FolderOpen}
      title={c.canManage ? t('empty.title') : t('empty.readOnlyTitle')}
      description={c.canManage ? t('empty.description') : t('empty.readOnlyDescription')}
    />
  )

  return (
    <div className="flex flex-col gap-4">
      {c.canManage && !base.embeddingModel && (
        <Banner
          tone="warning"
          title={t('noModel.title')}
          description={base.isLocalOnly ? t('noModel.localDescription') : t('noModel.description')}
          action={
            c.canOpenVault ? (
              <Button asChild variant="secondary" size="sm">
                <Link href={toRoute(ROUTES.workspace.vault(orgSlug))}>
                  {t('noModel.openVault')}
                </Link>
              </Button>
            ) : (
              <span className="text-caption">{t('noModel.askAdmin')}</span>
            )
          }
        />
      )}
      {c.canManage && (
        <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <FileDropzone
            labels={{
              title: t('dropzone.title'),
              hint: t('dropzone.hint', {
                limit: formatFileSize(KNOWLEDGE_FILE_LIMITS.maxBytes, locale),
              }),
              browse: t('dropzone.browse'),
            }}
            accept={ACCEPTED_FILES}
            maxSize={KNOWLEDGE_FILE_LIMITS.maxBytes}
            isDisabled={!c.canAdd}
            onFilesAccepted={uploads.onFilesAccepted}
            onFilesRejected={uploads.onFilesRejected}
          />
          <div className="border-border bg-surface flex flex-col gap-2.5 rounded-xl border p-4">
            <div className="flex flex-col gap-0.5">
              <h3 className="text-section-title">{t('links.title')}</h3>
              <p className="text-caption text-muted-foreground">{t('links.description')}</p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              icon={Plus}
              className="self-start"
              disabled={!c.canAdd}
              onClick={c.onAddLink}
            >
              {t('addLink')}
            </Button>
            <p className="text-caption text-muted-foreground mt-auto">{t('links.hint')}</p>
          </div>
        </div>
      )}
      {uploads.isQuotaReached && (
        <Banner
          tone="warning"
          title={t('quota.title')}
          description={t('quota.description')}
          onDismiss={uploads.onDismissQuota}
        />
      )}
      {uploads.items.length > 0 && (
        <FileUploadList
          items={uploads.items.map((item) => ({
            id: item.id,
            name: item.file.name,
            size: formatFileSize(item.file.size, locale),
            status: item.status,
            progress: item.progress,
            error: item.error,
          }))}
          labels={{
            uploading: t('upload.uploading'),
            done: t('upload.done'),
            retry: t('upload.retry'),
            remove: (name) => t('upload.remove', { name }),
          }}
          onRetry={uploads.onRetry}
          isRetryable={(item) =>
            uploads.items.find(({ id }) => id === item.id)?.isRetryable ?? false
          }
          onRemove={uploads.onRemove}
        />
      )}
      {base.processing.needsAttention > 0 && c.params.status === 'all' && (
        <Banner
          tone="warning"
          title={t('attention.title', { count: base.processing.needsAttention })}
          action={
            <Button variant="secondary" size="sm" onClick={c.onShowFailed}>
              {t('attention.show')}
            </Button>
          }
        />
      )}
      <DataTableToolbar>
        <DataTableSearch
          label={t('search.label')}
          placeholder={t('search.placeholder')}
          value={c.params.q}
          onValueChange={c.onSearchChange}
        />
        <FilterChips<SourceStatusFilter>
          label={t('filters.label')}
          options={SOURCE_STATUS_FILTERS.map((value) => ({
            value,
            label: t(`filters.${value}`),
          }))}
          value={c.params.status}
          onValueChange={c.onStatusChange}
        />
      </DataTableToolbar>
      {c.canManage && c.selectedSources.length > 0 && (
        <BulkActionBar
          labels={{
            selected: t('bulk.selected', { count: c.selectedSources.length }),
            clear: t('bulk.clear'),
          }}
          onClear={() => {
            c.onSelectionChange({})
          }}
        >
          <Button
            variant="secondary"
            size="sm"
            isLoading={c.isBulkPending}
            onClick={c.onReindexSelected}
          >
            {t('bulk.reindex')}
          </Button>
          <Button
            variant="destructive-ghost"
            size="sm"
            onClick={() => {
              c.onRemove(c.selectedSources)
            }}
          >
            {t('bulk.remove')}
          </Button>
        </BulkActionBar>
      )}
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
            <DataTable
              columns={columns}
              data={c.sources}
              getRowId={(source) => source.id}
              labels={{
                caption: t('tableLabel'),
                actions: t('columns.actions'),
                selectAll: t('bulk.selectAll'),
                selectRow: (id) =>
                  t('bulk.selectRow', { name: c.sources.find((s) => s.id === id)?.name ?? id }),
              }}
              sort={toSort(c.params.sort)}
              onSortChange={(next) => {
                c.onSortChange(toSourceSort(next.id, next.desc))
              }}
              selection={c.canManage ? c.selection : undefined}
              onSelectionChange={c.canManage ? c.onSelectionChange : undefined}
              rowActions={rowActions}
              isLoading={c.isLoading}
              emptyState={emptyState}
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
      {c.isAddingLink && (
        <AddLinkDialog orgId={c.orgId} baseId={base.id} onClose={c.onCloseAddLink} />
      )}
      {c.removing && (
        <RemoveSourcesDialog
          orgId={c.orgId}
          baseId={base.id}
          sources={c.removing}
          onClose={c.onCloseRemove}
          onRemoved={c.onRemoved}
        />
      )}
      {uploads.duplicates[0] && (
        <DuplicateFileDialog
          fileName={uploads.duplicates[0].file.name}
          remaining={uploads.duplicates.length - 1}
          onResolve={uploads.onResolveDuplicate}
        />
      )}
      {c.openSource && (
        <SourcePreview
          orgId={c.orgId}
          base={base}
          source={c.openSource}
          onClose={c.onClosePreview}
        />
      )}
    </div>
  )
}
