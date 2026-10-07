// SPDX-License-Identifier: AGPL-3.0-only
'use no memo'

import { useInfiniteQuery } from '@tanstack/react-query'
import { useNow, useTranslations } from 'next-intl'
import { useState } from 'react'

import {
  knowledgeQueries,
  useRestoreKnowledgeBaseMutation,
  useRestoreKnowledgeSourceMutation,
} from '@/api/knowledge'
import { ERROR_CODES } from '@surefy/contracts'
import type { DeletedKnowledgeItemDto } from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'
import { useForm } from '@surefy/web-core/forms'

import { restoreNameFormSchema } from '../../Knowledge.schema'

import type { BaseSyntheticEvent } from 'react'

type BaseItem = Extract<DeletedKnowledgeItemDto, { kind: 'knowledge_base' }>

/** Recently deleted: the bases and sources from the last 30 days, and Restore (T0). */
export function useRecentlyDeletedKnowledgeController(orgId: string) {
  const t = useTranslations('knowledge.library.deleted')
  const tErrors = useTranslations('errors')
  const now = useNow()
  const list = useInfiniteQuery(knowledgeQueries.deleted(orgId, {}))
  const restoreBase = useRestoreKnowledgeBaseMutation(orgId, { silent: true })
  const restoreSource = useRestoreKnowledgeSourceMutation(orgId)
  const [renaming, setRenaming] = useState<BaseItem | null>(null)
  const form = useForm({
    schema: restoreNameFormSchema,
    defaultValues: { name: '' },
  })

  const finishRestore = () => {
    setRenaming(null)
    toast.success(t('restored'))
  }

  const submitRename = form.handleSubmit(async ({ name }) => {
    if (!renaming) return
    try {
      await restoreBase.mutateAsync({ baseId: renaming.id, name })
      finishRestore()
    } catch (error) {
      if (!isApiError(error)) throw error
      form.setError('name', { message: getErrorMessage(error, tErrors) })
    }
  })

  let restoringId: string | null = null
  if (restoreBase.isPending) restoringId = restoreBase.variables.baseId
  else if (restoreSource.isPending) restoringId = restoreSource.variables.sourceId

  return {
    t,
    now,
    items: list.data?.pages.flatMap((page) => page.items) ?? [],
    isLoading: list.isPending,
    errorMessage: list.error ? getErrorMessage(list.error, tErrors) : null,
    errorReference: isApiError(list.error) ? list.error.requestId : undefined,
    refetch: () => void list.refetch(),
    hasMore: list.hasNextPage,
    isLoadingMore: list.isFetchingNextPage,
    onLoadMore: () => void list.fetchNextPage(),
    restoringId,
    onRestore: (item: DeletedKnowledgeItemDto) => {
      if (item.kind === 'source') {
        restoreSource.mutate(
          { baseId: item.knowledgeBase.id, sourceId: item.id },
          {
            onSuccess: () => {
              toast.success(t('restored'))
            },
          },
        )
        return
      }
      restoreBase.mutate(
        { baseId: item.id },
        {
          onSuccess: () => {
            toast.success(t('restored'))
          },
          onError: (error) => {
            // The name was taken while it waited: ask for another one
            if (isApiError(error) && error.code === ERROR_CODES.KNOWLEDGE_NAME_TAKEN) {
              form.reset({ name: item.name })
              setRenaming(item)
            } else toast.error(getErrorMessage(error, tErrors))
          },
        },
      )
    },
    renaming,
    form,
    isRenaming: form.formState.isSubmitting,
    renameError: form.formState.errors.name?.message,
    onCloseRename: () => {
      setRenaming(null)
    },
    onSubmitRename: (event: BaseSyntheticEvent) => {
      void submitRename(event)
    },
  }
}
