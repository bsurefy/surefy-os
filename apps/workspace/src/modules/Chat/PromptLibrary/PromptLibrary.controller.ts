// SPDX-License-Identifier: AGPL-3.0-only
'use no memo'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { useDeletePromptMutation, useRestorePromptMutation } from '@/api/prompts'
import { useDebouncedValue } from '@/hooks'
import { PERMISSIONS } from '@surefy/contracts'
import type { PromptDto, PromptVisibility } from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'
import { useCan } from '@surefy/web-core/access'

import { PROMPT_SEARCH_DEBOUNCE_MS } from './PromptLibrary.constants'
import { usePromptPages } from './PromptLibrary.hooks'

export type PromptFilter = 'all' | PromptVisibility

/** What the form dialog edits: a new prompt or an existing one. */
export type PromptFormTarget = { mode: 'create' } | { mode: 'edit'; prompt: PromptDto }

export interface PromptLibraryProps {
  orgId: string
  onClose: () => void
  /** Puts the finished prompt (variables filled) into the composer. */
  onUse: (text: string) => void
}

/**
 * The prompt library: the person's own prompts and the shared ones they can see, searchable, with
 * create, edit, delete and use. Deleting a personal prompt is T1 (Undo); a shared one is T2 and
 * names who loses it. Both stay restorable for 30 days.
 */
export function usePromptLibraryController({ orgId, onClose, onUse }: PromptLibraryProps) {
  const t = useTranslations('chat.prompts')
  const canManageShared = useCan(PERMISSIONS.PROMPTS_MANAGE_SHARED)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<PromptFilter>('all')
  const [formTarget, setFormTarget] = useState<PromptFormTarget | null>(null)
  const [fillTarget, setFillTarget] = useState<PromptDto | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PromptDto | null>(null)
  const query = useDebouncedValue(search.trim(), PROMPT_SEARCH_DEBOUNCE_MS)
  const pages = usePromptPages(orgId, {
    sort: '-updatedAt',
    ...(query === '' ? {} : { q: query }),
    ...(filter === 'all' ? {} : { visibility: filter }),
  })
  const deletePrompt = useDeletePromptMutation(orgId)
  const restorePrompt = useRestorePromptMutation(orgId)

  const remove = (prompt: PromptDto) => {
    deletePrompt.mutate(prompt.id, {
      onSuccess: () => {
        setPendingDelete(null)
        toast.undo(t('toasts.deleted'), {
          undoLabel: t('undo'),
          onUndo: () => {
            restorePrompt.mutate(prompt.id)
          },
        })
      },
    })
  }

  return {
    t,
    canManageShared,
    pages,
    search,
    onSearchChange: setSearch,
    filter,
    onFilterChange: setFilter,
    isFiltered: query !== '' || filter !== 'all',
    form: {
      target: formTarget,
      onCreate: () => {
        setFormTarget({ mode: 'create' })
      },
      onEdit: (prompt: PromptDto) => {
        setFormTarget({ mode: 'edit', prompt })
      },
      onClose: () => {
        setFormTarget(null)
      },
    },
    fill: {
      target: fillTarget,
      onClose: () => {
        setFillTarget(null)
      },
      onSubmit: (text: string) => {
        setFillTarget(null)
        onUse(text)
        onClose()
      },
    },
    /** A prompt without variables goes straight in; one with variables asks for them first. */
    onUse: (prompt: PromptDto) => {
      if (prompt.variables.length === 0) {
        onUse(prompt.body)
        onClose()
      } else setFillTarget(prompt)
    },
    onDelete: (prompt: PromptDto) => {
      if (prompt.visibility === 'shared') setPendingDelete(prompt)
      else remove(prompt)
    },
    pendingDelete: {
      prompt: pendingDelete,
      isPending: deletePrompt.isPending,
      onCancel: () => {
        setPendingDelete(null)
      },
      onConfirm: () => {
        if (pendingDelete) remove(pendingDelete)
      },
    },
  }
}
export type PromptLibraryController = ReturnType<typeof usePromptLibraryController>
