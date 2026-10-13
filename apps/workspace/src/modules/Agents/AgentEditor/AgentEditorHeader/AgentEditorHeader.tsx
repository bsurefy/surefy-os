// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Bot } from 'lucide-react'
import Link from 'next/link'

import { toRoute } from '@/modules/Workspace'
import { IconTile, StatusPill } from '@surefy/ui/components/DataDisplay'
import { PageHeader } from '@surefy/ui/components/Layout'
import { Breadcrumbs, Tabs } from '@surefy/ui/components/Navigation'
import { Button } from '@surefy/ui/primitives/button'

import { useAgentEditorHeaderController } from './AgentEditorHeader.controller'

import type { AgentEditorHeaderProps } from './AgentEditorHeader.types'

/**
 * Back to Agents, the name and status, the version line with the save status ("Version 3 is live ·
 * 2 unpublished changes · Saved 10:42"), Test and Publish, and the tabs.
 */
export default function AgentEditorHeader(props: Readonly<AgentEditorHeaderProps>) {
  const c = useAgentEditorHeaderController(props)
  const { t } = c

  return (
    <PageHeader
      level="object"
      title={props.name}
      icon={<IconTile icon={Bot} />}
      breadcrumb={
        <Breadcrumbs
          label={t('breadcrumb')}
          linkComponent={Link}
          items={[{ label: t('agents'), href: props.agentsHref }, { label: props.name }]}
        />
      }
      status={<StatusPill tone={c.tone} label={c.statusLabel} />}
      facts={
        <>
          <span>{c.versionText}</span>
          {c.changesText && <span>{c.changesText}</span>}
          {c.saveText && (
            <span role="status" className={c.saveFailed ? 'text-destructive' : undefined}>
              {c.saveText}
              {c.saveFailed && (
                <Button variant="link" size="sm" onClick={props.onRetry}>
                  {t('retry')}
                </Button>
              )}
            </span>
          )}
        </>
      }
      actions={
        props.canAct ? (
          <>
            <Button asChild variant="secondary">
              <Link href={toRoute(props.testHref)}>{t('test')}</Link>
            </Button>
            <Button asChild>
              <Link href={toRoute(props.publishHref)}>{c.publishLabel}</Link>
            </Button>
          </>
        ) : undefined
      }
      tabs={
        <Tabs label={t('tabs')} items={props.tabs} value={props.activeTab} linkComponent={Link} />
      }
    />
  )
}
