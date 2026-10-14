// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Bot, Check, ChevronDown } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { ModelList } from '@/modules/Vault'
import type { UsableAgentDto, UsableModelDto } from '@surefy/contracts'
import { MonoTile } from '@surefy/ui/components/DataDisplay'
import { cn } from '@surefy/ui/lib/utils'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@surefy/ui/primitives/command'
import { Popover, PopoverContent, PopoverTrigger } from '@surefy/ui/primitives/popover'
import { Skeleton } from '@surefy/ui/primitives/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@surefy/ui/primitives/tabs'

export interface ChatPickerProps {
  models: readonly UsableModelDto[]
  isModelsPending: boolean
  modelKey: string | null
  /** The message has images: models that cannot read them are disabled. */
  requiresVision: boolean
  agents: readonly UsableAgentDto[]
  /** Without `agents:invoke` the picker has no Agents tab. */
  canUseAgents: boolean
  /** The agent the chat talks to, or will talk to once it starts. */
  agent: { id: string; name: string } | null
  /** An agent chat that exists keeps its agent for good: the picker only names it. */
  isAgentLocked: boolean
  isDisabled: boolean
  onModelSelect: (modelKey: string) => void
  onAgentSelect: (agentId: string) => void
}

const TRIGGER =
  'border-border bg-surface flex h-8 max-w-full min-w-0 items-center gap-1.5 rounded-lg border pr-2 pl-1 text-left'

function AgentTile() {
  return (
    <span className="bg-primary-soft text-primary-soft-foreground flex size-6 shrink-0 items-center justify-center rounded-md">
      <Bot aria-hidden className="size-3.5" />
    </span>
  )
}

/** The agents shared with the person, searchable by name. */
function AgentList({
  agents,
  value,
  onSelect,
}: Readonly<{
  agents: readonly UsableAgentDto[]
  value: string | null
  onSelect: (agentId: string) => void
}>) {
  const t = useTranslations('chat.thread.picker')
  if (agents.length === 0) {
    return (
      <div className="flex flex-col gap-1 p-4">
        <p className="text-body font-medium">{t('noAgents.title')}</p>
        <p className="text-caption text-muted-foreground">{t('noAgents.description')}</p>
      </div>
    )
  }
  return (
    <Command>
      <CommandInput placeholder={t('searchAgents')} />
      <CommandList>
        <CommandEmpty>{t('noAgentMatch')}</CommandEmpty>
        <CommandGroup heading={t('sharedWithYou')}>
          {agents.map((agent) => (
            <CommandItem
              key={agent.id}
              value={`${agent.name} ${agent.id}`}
              onSelect={() => {
                onSelect(agent.id)
              }}
            >
              <AgentTile />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate">{agent.name}</span>
                {agent.description && (
                  <span className="text-caption text-muted-foreground line-clamp-2">
                    {agent.description}
                  </span>
                )}
              </div>
              {agent.id === value && <Check aria-hidden className="size-4" />}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  )
}

/**
 * The composer's model/agent picker (chat.md §2): a compact tile with the model or the agent, and
 * a popover with the tabs Models and Agents. Models come from Vault's list; Agents lists the agents
 * shared with the person. An existing agent chat keeps its agent, so the tile only names it.
 */
export default function ChatPicker({
  models,
  isModelsPending,
  modelKey,
  requiresVision,
  agents,
  canUseAgents,
  agent,
  isAgentLocked,
  isDisabled,
  onModelSelect,
  onAgentSelect,
}: Readonly<ChatPickerProps>) {
  const t = useTranslations('chat.thread.picker')
  const [isOpen, setIsOpen] = useState(false)
  const model = models.find((candidate) => candidate.modelKey === modelKey)

  if (agent && isAgentLocked) {
    return (
      <p className={TRIGGER} title={t('agentLocked', { name: agent.name })}>
        <AgentTile />
        <span className="text-label max-w-44 truncate font-medium">{agent.name}</span>
      </p>
    )
  }

  const modelList = (
    <ModelList
      models={models}
      isPending={isModelsPending}
      value={agent ? null : modelKey}
      requiresVision={requiresVision}
      onSelect={(key) => {
        onModelSelect(key)
        setIsOpen(false)
      }}
    />
  )
  const name = agent?.name ?? model?.displayName ?? t('placeholder')

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            TRIGGER,
            'hover:bg-surface-2 focus-visible:ring-ring data-[state=open]:border-primary data-[state=open]:ring-ring/30 duration-fast transition-colors outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 data-[state=open]:ring-[3px]',
          )}
          disabled={isDisabled || (isModelsPending && !agent)}
          aria-busy={(isModelsPending && !agent) || undefined}
          aria-label={t('label')}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
        >
          {isModelsPending && !agent ? (
            <>
              <Skeleton className="size-6 shrink-0 rounded-md" />
              <Skeleton className="h-3.5 w-24" />
            </>
          ) : (
            <>
              {agent ? (
                <AgentTile />
              ) : (
                <MonoTile size="sm">{name.slice(0, 1).toUpperCase()}</MonoTile>
              )}
              <span className="text-label max-w-44 truncate font-medium">{name}</span>
              <ChevronDown aria-hidden className="text-muted-foreground size-3.5 shrink-0" />
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        {canUseAgents ? (
          <Tabs defaultValue={agent ? 'agents' : 'models'}>
            <TabsList className="m-2 mb-0 w-[calc(100%-1rem)]">
              <TabsTrigger value="models">{t('tabs.models')}</TabsTrigger>
              <TabsTrigger value="agents">{t('tabs.agents')}</TabsTrigger>
            </TabsList>
            <TabsContent value="models">{modelList}</TabsContent>
            <TabsContent value="agents">
              <AgentList
                agents={agents}
                value={agent?.id ?? null}
                onSelect={(agentId) => {
                  onAgentSelect(agentId)
                  setIsOpen(false)
                }}
              />
            </TabsContent>
          </Tabs>
        ) : (
          modelList
        )}
      </PopoverContent>
    </Popover>
  )
}
