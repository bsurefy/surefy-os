// SPDX-License-Identifier: AGPL-3.0-only
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import {
  agentQueries,
  useAgentLifecycleMutation,
  useDeleteAgentMutation,
  useDuplicateAgentMutation,
} from '@/api/agents'
import { ROUTES } from '@/constants/routes'
import { toRoute } from '@/modules/Workspace'
import type { AgentDto } from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'

import { getArchiveTier } from './AgentsList.utils'

import type { AgentDialogState, AgentRowAction } from './AgentsList.types'

/**
 * What the "⋯" menu does. Duplicate, Resume and Restore act at once (T0). A draft is archived at
 * once with Undo (T1). Pause and archiving a published agent open a dialog that names the
 * consequence (T2). Deleting a never-published agent without runs hides it with Undo and deletes
 * when the toast ends (T1, deferred); any other delete asks for the name and a reason (T3).
 */
export function useAgentRowActions(orgId: string, orgSlug: string) {
  const t = useTranslations('agents.list')
  const router = useRouter()
  const queryClient = useQueryClient()
  const lifecycle = useAgentLifecycleMutation(orgId)
  const duplicate = useDuplicateAgentMutation(orgId)
  const remove = useDeleteAgentMutation(orgId)
  const [dialog, setDialog] = useState<AgentDialogState | null>(null)
  const [hiddenIds, setHiddenIds] = useState<readonly string[]>([])

  const hide = (agent: AgentDto) => {
    setHiddenIds((ids) => [...ids, agent.id])
  }
  const show = (agent: AgentDto) => {
    setHiddenIds((ids) => ids.filter((id) => id !== agent.id))
  }

  const archiveDraft = (agent: AgentDto) => {
    lifecycle.mutate(
      { agentId: agent.id, action: 'archive' },
      {
        onSuccess: () => {
          toast.undo(t('toasts.archived', { name: agent.name }), {
            undoLabel: t('toasts.undo'),
            onUndo: () => {
              lifecycle.mutate({ agentId: agent.id, action: 'restore' })
            },
          })
        },
      },
    )
  }

  const deleteDeferred = (agent: AgentDto) => {
    hide(agent)
    toast.undo(t('toasts.deleted', { name: agent.name }), {
      undoLabel: t('toasts.undo'),
      onUndo: () => {
        show(agent)
      },
      onCommit: () => {
        remove.mutate(
          { agentId: agent.id },
          {
            onSettled: () => {
              show(agent)
            },
          },
        )
      },
    })
  }

  const startDelete = async (agent: AgentDto) => {
    // The server decides whether the delete needs the name and a reason; unsure means ask
    const impact = await queryClient
      .query(agentQueries.impact(orgId, agent.id, 'delete'))
      .catch(() => null)
    if (impact && !impact.deleteRequiresConfirmation) deleteDeferred(agent)
    else setDialog({ action: 'delete', agent })
  }

  return {
    hiddenIds,
    dialog,
    onCloseDialog: () => {
      setDialog(null)
    },
    onAction: (action: AgentRowAction, agent: AgentDto) => {
      switch (action) {
        case 'duplicate': {
          duplicate.mutate(
            { agentId: agent.id },
            {
              onSuccess: (copy) => {
                toast.success(t('toasts.duplicated', { name: copy.name }))
                router.push(toRoute(ROUTES.workspace.agent(orgSlug, copy.id)))
              },
            },
          )
          break
        }
        case 'resume': {
          lifecycle.mutate(
            { agentId: agent.id, action: 'resume' },
            {
              onSuccess: () => {
                toast.success(t('toasts.resumed', { name: agent.name }))
              },
            },
          )
          break
        }
        case 'restore': {
          lifecycle.mutate(
            { agentId: agent.id, action: 'restore' },
            {
              onSuccess: () => {
                toast.success(t('toasts.restored', { name: agent.name }))
              },
            },
          )
          break
        }
        case 'pause': {
          setDialog({ action: 'pause', agent })
          break
        }
        case 'archive': {
          if (getArchiveTier(agent) === 'T1') archiveDraft(agent)
          else setDialog({ action: 'archive', agent })
          break
        }
        case 'delete': {
          void startDelete(agent)
          break
        }
      }
    },
  }
}
