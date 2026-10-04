// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Bot, MessageSquare, Plus, Search, UserPlus } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Section } from '@surefy/ui/components/Layout'
import { CommandPalette, ConfirmDialog, SidePanel } from '@surefy/ui/components/Overlay'
import { Button } from '@surefy/ui/primitives/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@surefy/ui/primitives/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@surefy/ui/primitives/tooltip'

const MEMBERS = ['Ana Ruiz', 'Ben Okafor', 'Chen Wei']
const DIALOG_WIDTH = { sm: 400, md: 520, lg: 640 }

const wait = (ms: number) =>
  new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms)
  })

/** Dialog sizes, T2 and T3 confirmations, the side panel and the command palette (⌘K). */
export default function OverlaysDemo() {
  const [isT2Open, setIsT2Open] = useState(false)
  const [isT3Open, setIsT3Open] = useState(false)
  const [panelIndex, setPanelIndex] = useState<number | null>(null)
  const [isPaletteOpen, setIsPaletteOpen] = useState(false)
  const [lastCommand, setLastCommand] = useState('')

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setIsPaletteOpen((open) => !open)
      }
    }
    globalThis.addEventListener('keydown', handleKey)
    return () => {
      globalThis.removeEventListener('keydown', handleKey)
    }
  }, [])

  const member = panelIndex === null ? null : MEMBERS[panelIndex]

  return (
    <Section
      title="Overlays"
      description="Dialogs, confirmation tiers, side panel, command palette."
    >
      <div className="flex flex-wrap gap-2">
        {(['sm', 'md', 'lg'] as const).map((size) => (
          <Dialog key={size}>
            <DialogTrigger asChild>
              <Button variant="secondary">Dialog {size}</Button>
            </DialogTrigger>
            <DialogContent size={size}>
              <DialogHeader>
                <DialogTitle>Rename team</DialogTitle>
                <DialogDescription>Members see the new name right away.</DialogDescription>
              </DialogHeader>
              <DialogBody>
                <p>Width {DIALOG_WIDTH[size]}px, 64px from the top.</p>
              </DialogBody>
              <DialogFooter showCloseButton>
                <Button>Save</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ))}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost">Hover or focus me</Button>
          </TooltipTrigger>
          <TooltipContent>Shown after 500ms on hover and on focus</TooltipContent>
        </Tooltip>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="destructive-ghost"
          onClick={() => {
            setIsT2Open(true)
          }}
        >
          Revoke key (T2)
        </Button>
        <Button
          variant="destructive-ghost"
          onClick={() => {
            setIsT3Open(true)
          }}
        >
          Delete knowledge base (T3)
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            setPanelIndex(0)
          }}
        >
          Open side panel
        </Button>
        <Button
          variant="secondary"
          icon={Search}
          onClick={() => {
            setIsPaletteOpen(true)
          }}
        >
          Command palette (⌘K)
        </Button>
      </div>
      {lastCommand && <p className="text-caption text-muted-foreground">Ran: {lastCommand}</p>}

      <ConfirmDialog
        open={isT2Open}
        onOpenChange={setIsT2Open}
        tier="T2"
        title="Revoke the OpenAI key?"
        description="Requests that use it stop at once. You can add a new key later."
        impact={['3 agents use this key and will stop working', '2 flows call these agents']}
        labels={{ confirm: 'Revoke key' }}
        onConfirm={() => wait(800)}
      />
      <ConfirmDialog
        open={isT3Open}
        onOpenChange={setIsT3Open}
        tier="T3"
        title="Delete Product docs?"
        description="Its 214 documents and their search index are removed. You can restore it for 30 days."
        impact={['4 agents answer from this knowledge base', '12 chats cite its documents']}
        confirmationText="Product docs"
        labels={{
          confirm: 'Delete knowledge base',
          reason: 'Reason',
          reasonHelp: 'Saved in the audit log and shown in the audit entry.',
          reasonRequired: 'Enter a reason, like "Replaced by the 2027 handbook"',
          typeToConfirm: (name) => `Type ${name} to confirm`,
          typeMismatch: (name) => `The name does not match. Type ${name}`,
        }}
        onConfirm={() => wait(800)}
      />
      <SidePanel
        open={member !== null}
        onOpenChange={(open) => {
          if (!open) setPanelIndex(null)
        }}
        title={member ?? ''}
        description="Member · Support team"
        onPrevious={
          panelIndex
            ? () => {
                setPanelIndex(panelIndex - 1)
              }
            : undefined
        }
        onNext={
          panelIndex !== null && panelIndex < MEMBERS.length - 1
            ? () => {
                setPanelIndex(panelIndex + 1)
              }
            : undefined
        }
        fullPageHref="#member-full-page"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setPanelIndex(null)
              }}
            >
              Cancel
            </Button>
            <Button>Save</Button>
          </>
        }
      >
        <p>Role, teams and recent activity of {member} go here.</p>
        {Array.from({ length: 12 }, (_, index) => (
          <p key={index} className="text-foreground-secondary">
            Activity row {index + 1}: the body scrolls while the header and footer stay.
          </p>
        ))}
      </SidePanel>
      <CommandPalette
        open={isPaletteOpen}
        onOpenChange={setIsPaletteOpen}
        labels={{
          title: 'Search and commands',
          description: 'Search agents, chats and people, or run an action',
          placeholder: 'Search agents, chats, people or actions',
          empty: (query) => `No results for "${query}". Try an agent name or a person's email.`,
        }}
        recent={{
          heading: 'Recent',
          items: [
            {
              id: 'chat-1',
              label: 'Refund policy for annual plans',
              description: 'Chat',
              icon: MessageSquare,
              onSelect: () => {
                setLastCommand('Open chat')
              },
            },
          ],
        }}
        groups={[
          {
            heading: 'Agents',
            items: ['Support triage', 'Invoice checker'].map((name) => ({
              id: name,
              label: name,
              description: 'Agent',
              icon: Bot,
              onSelect: () => {
                setLastCommand(`Open ${name}`)
              },
            })),
          },
          {
            heading: 'Actions',
            items: [
              {
                id: 'new-agent',
                label: 'Create agent',
                icon: Plus,
                shortcut: '⌘N',
                onSelect: () => {
                  setLastCommand('Create agent')
                },
              },
              {
                id: 'invite',
                label: 'Invite member',
                icon: UserPlus,
                onSelect: () => {
                  setLastCommand('Invite member')
                },
              },
            ],
          },
        ]}
      />
    </Section>
  )
}
