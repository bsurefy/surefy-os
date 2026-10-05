// SPDX-License-Identifier: AGPL-3.0-only
import { useInfiniteQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import {
  useCancelKnowledgeEmbeddingModelMutation,
  useSetKnowledgeEmbeddingModelMutation,
  useUpdateKnowledgeBaseMutation,
} from '@/api/knowledge'
import { modelQueries } from '@/api/models'
import { PERMISSIONS } from '@surefy/contracts'
import type { KnowledgeBaseDto, KnowledgeChunkingPreset } from '@surefy/contracts'
import { useCan, useCurrentOrgId } from '@surefy/web-core/access'

import { EMBEDDING_MODEL_TYPE, PEOPLE_LOOKUP_LIMIT } from '../Knowledge.constants'

/** What is waiting for the T2 confirmation: another embedding model or another chunking preset. */
export type PendingChange =
  { kind: 'model'; modelKey: string } | { kind: 'preset'; preset: KnowledgeChunkingPreset }

/** Settings: the embedding model (Admin), the chunking preset, "Local models only", and the danger zone. */
export function useSettingsTabController(base: KnowledgeBaseDto) {
  const t = useTranslations('knowledge.detail.settings')
  const orgId = useCurrentOrgId()
  const canChooseModel = useCan(PERMISSIONS.VAULT_MANAGE)
  const [pending, setPending] = useState<PendingChange | null>(null)
  const update = useUpdateKnowledgeBaseMutation(orgId, base.id)
  const setModel = useSetKnowledgeEmbeddingModelMutation(orgId, base.id)
  const cancel = useCancelKnowledgeEmbeddingModelMutation(orgId, base.id)
  // Enabled embedding models; a "Local models only" base can only use local or trained ones
  const models = useInfiniteQuery({
    ...modelQueries.list(orgId, {
      type: EMBEDDING_MODEL_TYPE,
      isEnabled: true,
      limit: PEOPLE_LOOKUP_LIMIT,
    }),
    enabled: canChooseModel,
  })
  const available = (models.data?.pages.flatMap((page) => page.items) ?? []).filter(
    (model) => !base.isLocalOnly || model.source !== 'provider',
  )

  return {
    t,
    orgId,
    canChooseModel,
    isReindexing: base.reindex !== null,
    modelOptions: available.map((model) => ({ value: model.modelKey, label: model.displayName })),
    hasLocalModel: available.length > 0,
    pending,
    onModelChange: (modelKey: string) => {
      if (modelKey === base.embeddingModel?.modelKey) return
      // A base with no model has nothing to re-index: it just starts using the model
      if (base.embeddingModel === null) setModel.mutate({ modelKey })
      else setPending({ kind: 'model', modelKey })
    },
    onPresetChange: (preset: KnowledgeChunkingPreset) => {
      if (preset !== base.chunkingPreset) setPending({ kind: 'preset', preset })
    },
    onCancelChange: () => {
      setPending(null)
    },
    onConfirmChange: async () => {
      if (!pending) return
      if (pending.kind === 'model') await setModel.mutateAsync({ modelKey: pending.modelKey })
      else await update.mutateAsync({ chunkingPreset: pending.preset })
    },
    onLocalOnlyChange: (isLocalOnly: boolean) => {
      update.mutate({ isLocalOnly })
    },
    isUpdating: update.isPending,
    onCancelReindex: () => {
      cancel.mutate()
    },
    isCancelling: cancel.isPending,
  }
}
