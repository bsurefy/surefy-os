// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { BookOpen, BookX, Ellipsis, Pencil, RefreshCw, Settings, Trash2 } from 'lucide-react'
import Link from 'next/link'

import { useReindexKnowledgeBaseMutation } from '@/api/knowledge'
import { ROUTES } from '@/constants/routes'
import { toRoute } from '@/modules/Workspace'
import {
  DataLocationBadge,
  EmptyState,
  IconTile,
  StatusPill,
} from '@surefy/ui/components/DataDisplay'
import { Banner, ErrorState } from '@surefy/ui/components/Feedback'
import { PageHeader } from '@surefy/ui/components/Layout'
import { Breadcrumbs, Tabs } from '@surefy/ui/components/Navigation'
import { Button } from '@surefy/ui/primitives/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@surefy/ui/primitives/dropdown-menu'
import { Skeleton } from '@surefy/ui/primitives/skeleton'

import AccessTab from '../AccessTab'
import SettingsTab from '../SettingsTab'
import SourcesTab from '../SourcesTab'
import TestSearchTab from '../TestSearchTab'
import DeleteBaseDialog from './DeleteBaseDialog'
import { useKnowledgeBaseDetailController } from './KnowledgeBaseDetail.controller'
import ReindexConfirmDialog from './ReindexConfirmDialog'
import RenameBaseDialog from './RenameBaseDialog'

/**
 * One knowledge base: the header with its facts and "⋯" menu, and its tabs (Sources, Test search,
 * Access, Settings). People who can only search see the sources.
 */
export default function KnowledgeBaseDetail() {
  const c = useKnowledgeBaseDetailController()
  const { t, base } = c
  const reindex = useReindexKnowledgeBaseMutation(c.orgId, c.baseId, { silent: true })

  if (c.isLoading) {
    return (
      <div role="status" aria-label={t('loading')} className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-5 w-96" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }
  if (c.isNotFound) {
    return (
      <EmptyState
        icon={BookX}
        title={t('notFound.title')}
        description={t('notFound.description')}
        secondaryAction={
          <Button asChild variant="secondary">
            <Link href={toRoute(c.libraryHref)}>{t('notFound.back')}</Link>
          </Button>
        }
      />
    )
  }
  if (!base) {
    return (
      <ErrorState
        title={t('loadError')}
        message={c.errorMessage ?? ''}
        reference={c.errorReference}
        onRetry={c.refetch}
      />
    )
  }

  const model = base.embeddingModel
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        level="object"
        title={base.name}
        icon={<IconTile icon={BookOpen} />}
        breadcrumb={
          <Breadcrumbs
            label={t('breadcrumb')}
            linkComponent={Link}
            items={[{ label: t('library'), href: c.libraryHref }, { label: base.name }]}
          />
        }
        status={base.isLocalOnly ? <StatusPill tone="success" label={t('localOnly')} /> : undefined}
        facts={
          <>
            <span>
              {t('facts', {
                sources: base.sourceCount,
                passages: base.chunkCount,
                agents: base.usedByCount,
              })}
            </span>
            {model && (
              <DataLocationBadge
                location={model.dataLocation === 'local' ? 'local' : 'provider'}
                label={
                  model.dataLocation === 'local'
                    ? t('dataLocation.local')
                    : t('dataLocation.provider', { model: model.displayName })
                }
              />
            )}
          </>
        }
        actions={
          c.canManage ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" icon={Ellipsis} aria-label={t('menu.label')}>
                  {t('menu.trigger')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() => {
                    c.openDialog('rename')
                  }}
                >
                  <Pencil aria-hidden />
                  {t('menu.rename')}
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link
                    href={toRoute(ROUTES.workspace.knowledgeBase(c.orgSlug, c.baseId, 'settings'))}
                  >
                    <Settings aria-hidden />
                    {t('menu.settings')}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!model || base.reindex !== null}
                  onSelect={() => {
                    c.openDialog('reindex')
                  }}
                >
                  <RefreshCw aria-hidden />
                  {t('menu.reindex')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => {
                    c.openDialog('delete')
                  }}
                >
                  <Trash2 aria-hidden />
                  {t('menu.delete')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : undefined
        }
        tabs={
          c.tabs.length > 1 ? (
            <Tabs label={t('tabs.label')} items={c.tabs} value={c.activeTab} linkComponent={Link} />
          ) : undefined
        }
      />
      {base.reindex && (
        <Banner
          tone="info"
          title={t('reindexing.title')}
          description={t('reindexing.description', {
            done: base.reindex.documentsDone,
            total: base.reindex.documentsTotal,
          })}
        />
      )}
      {c.activeTab === 'sources' && <SourcesTab base={base} />}
      {c.activeTab === 'test-search' && <TestSearchTab base={base} />}
      {c.activeTab === 'access' && <AccessTab base={base} />}
      {c.activeTab === 'settings' && (
        <SettingsTab
          base={base}
          onRename={() => {
            c.openDialog('rename')
          }}
          onDelete={() => {
            c.openDialog('delete')
          }}
        />
      )}
      {c.dialog === 'rename' && (
        <RenameBaseDialog orgId={c.orgId} base={base} onClose={c.closeDialog} />
      )}
      {c.dialog === 'reindex' && (
        <ReindexConfirmDialog
          orgId={c.orgId}
          baseId={base.id}
          kind="reindex"
          onConfirm={() => reindex.mutateAsync()}
          onClose={c.closeDialog}
        />
      )}
      {c.dialog === 'delete' && (
        <DeleteBaseDialog orgId={c.orgId} orgSlug={c.orgSlug} base={base} onClose={c.closeDialog} />
      )}
    </div>
  )
}
