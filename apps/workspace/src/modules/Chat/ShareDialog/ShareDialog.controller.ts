// SPDX-License-Identifier: AGPL-3.0-only
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { chatQueries, useCreateChatSharesMutation, useDeleteChatShareMutation } from '@/api/chats'
import { useDebouncedValue } from '@/hooks'
import { CHAT_SHARES_MAX } from '@surefy/contracts'
import type { ChatShareSubject, ChatShareTargetDto } from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'

import { SEARCH_DEBOUNCE_MS } from '../ChatList/ChatList.constants'

/** A picker value: `user:<id>` or `team:<id>`. */
export const targetValue = (target: ChatShareTargetDto) =>
  target.subjectType === 'user' ? `user:${target.user.id}` : `team:${target.team.id}`

const toSubject = (value: string): ChatShareSubject => {
  const [kind, id = ''] = value.split(':')
  return kind === 'team' ? { subjectType: 'team', teamId: id } : { subjectType: 'user', userId: id }
}

/**
 * Share one of the person's chats (chat.md §2): view only, with people and teams of the
 * organization. Lists who has access now, picks more by name, removes a share. Private chats and
 * organizations with sharing turned off say so instead.
 */
export function useShareDialogController(orgId: string, chatId: string, isPrivate: boolean) {
  const t = useTranslations('chat.share')
  const tErrors = useTranslations('errors')
  const [search, setSearch] = useState('')
  const query = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS)
  const [selected, setSelected] = useState<string[]>([])
  const shares = useQuery(chatQueries.shares(orgId, chatId))
  const sharingEnabled = shares.data?.sharingEnabled ?? true
  const canShare = !isPrivate && sharingEnabled && shares.isSuccess
  const targets = useQuery({
    ...chatQueries.shareTargets(orgId, query === '' ? {} : { q: query }),
    enabled: canShare,
  })
  const create = useCreateChatSharesMutation(orgId, chatId)
  const remove = useDeleteChatShareMutation(orgId, chatId)

  const sharedIds = new Set(
    (shares.data?.shares ?? []).map((share) =>
      share.team ? `team:${share.team.id}` : `user:${share.user?.id ?? ''}`,
    ),
  )
  const options = (targets.data ?? [])
    .filter((target) => !sharedIds.has(targetValue(target)))
    .map((target) =>
      target.subjectType === 'user'
        ? { value: targetValue(target), label: target.user.name, description: target.user.email }
        : {
            value: targetValue(target),
            label: target.team.name,
            description: t('teamMembers', { count: target.team.memberCount }),
          },
    )

  return {
    t,
    shares,
    loadError: shares.error ? getErrorMessage(shares.error, tErrors) : null,
    loadErrorReference: isApiError(shares.error) ? shares.error.requestId : undefined,
    sharingEnabled,
    canShare,
    picker: {
      options,
      value: selected,
      isLoading: targets.isFetching,
      onValueChange: (value: string[]) => {
        setSelected(value.slice(0, CHAT_SHARES_MAX))
      },
      onSearchChange: setSearch,
    },
    isSharing: create.isPending,
    onShare: () => {
      if (selected.length === 0) return
      create.mutate(
        { subjects: selected.map(toSubject) },
        {
          onSuccess: () => {
            toast.success(t('toasts.shared', { count: selected.length }))
            setSelected([])
          },
        },
      )
    },
    removingId: remove.isPending ? remove.variables : null,
    onRemove: (shareId: string) => {
      remove.mutate(shareId)
    },
  }
}
export type ShareDialogController = ReturnType<typeof useShareDialogController>
