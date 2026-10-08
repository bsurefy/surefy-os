// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { History } from 'lucide-react'

import { EmptyState } from '@surefy/ui/components/DataDisplay'
import { ErrorState, SkeletonRows } from '@surefy/ui/components/Feedback'
import { Section } from '@surefy/ui/components/Layout'
import { LoadMore } from '@surefy/ui/components/Navigation'

import RollbackDialog from './RollbackDialog'
import VersionRow from './VersionRow'
import { useVersionsTabController } from './VersionsTab.controller'

import type { VersionsTabProps } from './VersionsTab.types'

/** Versions: the published versions with author, date, notes and what changed; Roll back. */
export default function VersionsTab(props: Readonly<VersionsTabProps>) {
  const c = useVersionsTabController(props)
  const { t } = c

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

  let content
  if (c.isLoading) {
    content = <SkeletonRows rows={3} />
  } else if (c.versions.length === 0) {
    content = (
      <EmptyState
        icon={History}
        headingLevel={3}
        title={t('empty.title')}
        description={t('empty.description')}
      />
    )
  } else {
    content = (
      <>
        <ul className="flex flex-col gap-2">
          {c.versions.map((version, index) => (
            <VersionRow
              key={version.id}
              orgId={c.orgId}
              agentId={c.agentId}
              version={version}
              previousId={c.versions[index + 1]?.id ?? null}
              isExpanded={c.expandedId === version.id}
              canRollBack={c.canRollBack}
              onToggle={() => void c.onToggle(version, index)}
              onRollback={() => {
                c.onRollback(version)
              }}
            />
          ))}
        </ul>
        <LoadMore
          label={t('loadMore')}
          onLoadMore={c.onLoadMore}
          isLoading={c.isLoadingMore}
          hasMore={c.hasMore}
        />
      </>
    )
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Section title={t('title')} description={t('description')}>
        {content}
      </Section>
      {c.rollbackTarget && (
        <RollbackDialog
          orgId={c.orgId}
          agentId={c.agentId}
          version={c.rollbackTarget}
          onClose={c.onCloseRollback}
        />
      )}
    </div>
  )
}
