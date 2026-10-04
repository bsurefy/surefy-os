// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import {
  Bell,
  Bot,
  BookOpen,
  ChartLine,
  MessageSquare,
  Plus,
  Settings,
  Shield,
  Workflow,
} from 'lucide-react'
import { useState } from 'react'

import { AppShell, PageHeader, Section, Stack } from '@surefy/ui/components/Layout'
import {
  Breadcrumbs,
  LoadMore,
  NavItem,
  PaginationFooter,
  Sidebar,
  SidebarGroup,
  Stepper,
  Tabs,
} from '@surefy/ui/components/Navigation'
import { Button } from '@surefy/ui/primitives/button'

const tabs = [
  { value: 'sources', label: 'Sources', count: 12 },
  { value: 'search', label: 'Test search' },
  { value: 'access', label: 'Access' },
  { value: 'settings', label: 'Settings' },
]

export default function LayoutShowcase() {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [tab, setTab] = useState('sources')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [extraPages, setExtraPages] = useState(0)

  const sidebar = (
    <Sidebar
      label="Main navigation"
      isCollapsed={isCollapsed}
      header={<span className="text-section-title">{isCollapsed ? 'S' : 'SurefyOS'}</span>}
      footer={
        <span className="text-caption text-muted-foreground">
          {isCollapsed ? 'AL' : 'Acme Logistics'}
        </span>
      }
    >
      <SidebarGroup label="Work" isCollapsed={isCollapsed}>
        <NavItem href="#" label="Chat" icon={MessageSquare} isActive isCollapsed={isCollapsed} />
        <NavItem href="#" label="Agents" icon={Bot} count={3} isCollapsed={isCollapsed} />
        <NavItem href="#" label="Flows" icon={Workflow} isCollapsed={isCollapsed} />
        <NavItem href="#" label="Knowledge" icon={BookOpen} isCollapsed={isCollapsed} />
      </SidebarGroup>
      <SidebarGroup label="Manage" isCollapsed={isCollapsed}>
        <NavItem href="#" label="Insights" icon={ChartLine} isCollapsed={isCollapsed} />
        <NavItem href="#" label="Guard" icon={Shield} isCollapsed={isCollapsed} />
        <NavItem href="#" label="Settings" icon={Settings} isCollapsed={isCollapsed} />
      </SidebarGroup>
    </Sidebar>
  )

  const topBar = (
    <div className="z-frame border-border bg-surface sticky top-0 flex h-14 items-center justify-between border-b px-4 md:px-6">
      <Breadcrumbs
        label="Breadcrumb"
        items={[
          { label: 'Knowledge', href: '#' },
          { label: 'Product docs', href: '#' },
          { label: 'Sources', href: '#' },
          { label: 'Pricing.pdf' },
        ]}
      />
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon-md" aria-label="Notifications" icon={Bell} />
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setIsCollapsed((value) => !value)
          }}
        >
          {isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        </Button>
      </div>
    </div>
  )

  return (
    <AppShell sidebar={sidebar} topBar={topBar}>
      <Stack gap={6}>
        <PageHeader
          title="Knowledge"
          description="Company documents and links your agents and chats can answer from."
          actions={<Button icon={Plus}>New knowledge base</Button>}
          tabs={
            <Tabs label="Knowledge base views" value={tab} onValueChange={setTab} items={tabs} />
          }
        />
        <Section
          title="Object header"
          description="Detail pages use the object title, status and key facts."
        >
          <PageHeader
            level="object"
            title="Product docs"
            status={
              <span className="bg-success-soft text-label text-success-soft-foreground rounded-full px-2">
                Ready
              </span>
            }
            facts={
              <>
                <span>214 documents</span>
                <span>Updated 2 hours ago</span>
              </>
            }
            actions={<Button variant="secondary">Edit</Button>}
          />
        </Section>
        <Section title="Stepper">
          <Stepper
            label="Setup steps"
            steps={['Welcome', 'Organization', 'AI model', 'Ready']}
            current={2}
            stateLabels={{ done: 'done', current: 'current step' }}
          />
        </Section>
        <Section title="Pagination">
          <PaginationFooter
            labels={{
              range: `${String((page - 1) * 50 + 1)}–${String(page * 50)} of 4,812`,
              previous: 'Previous page',
              next: 'Next page',
              pageSize: 'Rows per page',
            }}
            hasPrevious={page > 1}
            hasNext
            onPrevious={() => {
              setPage((value) => value - 1)
            }}
            onNext={() => {
              setPage((value) => value + 1)
            }}
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
          />
          <LoadMore
            label={`Load more (${String(extraPages)} loaded)`}
            hasMore={extraPages < 3}
            onLoadMore={() => {
              setExtraPages((value) => value + 1)
            }}
          />
        </Section>
      </Stack>
    </AppShell>
  )
}
