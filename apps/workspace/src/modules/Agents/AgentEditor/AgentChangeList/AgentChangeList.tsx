// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Minus, PencilLine, Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { describeChange } from './AgentChangeList.utils'

import type { AgentChangeListProps } from './AgentChangeList.types'

const KIND_ICONS = { added: Plus, removed: Minus, changed: PencilLine } as const

/**
 * What differs between two definitions, one line per change, with the editor tab it belongs to
 * ("Tool Refund API removed", "Creativity 30% → 50%"). Shown on Publish and on Versions.
 */
export default function AgentChangeList({ changes }: Readonly<AgentChangeListProps>) {
  const t = useTranslations('agents.editor.changes')
  const tTabs = useTranslations('agents.editor.tabs')

  return (
    <ul className="flex flex-col gap-1.5">
      {changes.map((change, index) => {
        const { text, section, kind } = describeChange(change, t)
        const Icon = KIND_ICONS[kind]
        return (
          <li
            key={`${section}:${change.label}:${kind}:${index}`}
            className="flex items-start gap-2"
          >
            <Icon aria-hidden className="text-muted-foreground mt-0.5 size-4 shrink-0" />
            <span className="text-body text-foreground min-w-0 flex-1">{text}</span>
            <span className="text-caption text-muted-foreground shrink-0">{tTabs(section)}</span>
          </li>
        )
      })}
    </ul>
  )
}
