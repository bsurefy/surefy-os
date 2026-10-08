// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Banner } from '@surefy/ui/components/Feedback'
import { Button } from '@surefy/ui/primitives/button'

import AgentEditorHeader from '../AgentEditorHeader'
import GuardTab from '../GuardTab'
import InstructionsTab from '../InstructionsTab'
import KnowledgeTab from '../KnowledgeTab'
import ModelTab from '../ModelTab'
import PublishTab from '../PublishTab'
import RunsTab from '../RunsTab'
import TestTab from '../TestTab'
import ToolsTab from '../ToolsTab'
import VersionsTab from '../VersionsTab'
import { useAgentEditorWorkspaceController } from './AgentEditorWorkspace.controller'

import type { AgentEditorWorkspaceProps } from './AgentEditorWorkspace.types'

/** One agent in the editor: the header, a notice when it is read-only or has a conflict, and the open tab. */
export default function AgentEditorWorkspace(props: Readonly<AgentEditorWorkspaceProps>) {
  const c = useAgentEditorWorkspaceController(props)
  const { t, draft } = c
  const { agent } = props
  const tabProps = {
    agent,
    definition: draft.definition,
    onDefinitionChange: draft.onDefinitionChange,
    isReadOnly: c.isReadOnly,
  }
  const status = draft.status

  return (
    <div className="flex flex-col gap-6">
      <AgentEditorHeader
        name={c.name}
        status={agent.status}
        liveVersion={agent.liveVersion}
        changeCount={c.changeCount}
        hasUnpublishedChanges={agent.hasUnpublishedChanges}
        saveStatus={c.isReadOnly ? null : status}
        canAct={!c.isReadOnly}
        agentsHref={c.agentsHref}
        testHref={c.testHref}
        publishHref={c.publishHref}
        tabs={c.tabs}
        activeTab={c.activeTab}
        onRetry={draft.retry}
      />
      {c.isArchived && (
        <Banner tone="info" title={t('archived.title')} description={t('archived.description')} />
      )}
      {!c.isArchived && c.isReadOnly && (
        <Banner tone="info" title={t('readOnly.title')} description={t('readOnly.description')} />
      )}
      {status.kind === 'conflict' && (
        <Banner
          tone="warning"
          isAnnounced
          title={
            status.publishedVersion === null
              ? t('conflict.changed', {
                  name: status.remote.draft.updatedBy?.name ?? t('conflict.someone'),
                })
              : t('conflict.published', {
                  name: status.remote.draft.updatedBy?.name ?? t('conflict.someone'),
                  version: status.publishedVersion,
                })
          }
          description={t('conflict.description')}
          action={
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={draft.reviewChanges}>
                {t('conflict.review')}
              </Button>
              <Button size="sm" onClick={draft.keepMine}>
                {t('conflict.keepMine')}
              </Button>
            </div>
          }
        />
      )}
      {c.activeTab === 'instructions' && (
        <InstructionsTab
          {...tabProps}
          meta={draft.meta}
          isNameValid={draft.isNameValid}
          onMetaChange={draft.onMetaChange}
        />
      )}
      {c.activeTab === 'model' && <ModelTab {...tabProps} />}
      {c.activeTab === 'tools' && <ToolsTab />}
      {c.activeTab === 'knowledge' && <KnowledgeTab {...tabProps} />}
      {c.activeTab === 'guard' && <GuardTab />}
      {c.activeTab === 'test' && <TestTab />}
      {c.activeTab === 'publish' && <PublishTab />}
      {c.activeTab === 'versions' && <VersionsTab />}
      {c.activeTab === 'runs' && <RunsTab />}
    </div>
  )
}
