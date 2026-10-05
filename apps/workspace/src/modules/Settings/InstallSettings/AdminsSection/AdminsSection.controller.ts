// SPDX-License-Identifier: AGPL-3.0-only
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import {
  installQueries,
  useAddInstallAdminMutation,
  useRemoveInstallAdminMutation,
} from '@/api/install'
import { memberQueries } from '@/api/members'
import type { InstallAdminDto } from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'
import { useCurrentOrgId } from '@surefy/web-core/access'
import { meQueries } from '@surefy/web-core/api/me'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'

const PEOPLE_LIMIT = 100

/** Install administrators: who they are, adding someone with an account, removing one (T2). */
export function useAdminsSectionController() {
  const t = useTranslations('settings.install.admins')
  const tErrors = useTranslations('errors')
  const orgId = useCurrentOrgId()
  const admins = useQuery(installQueries.admins())
  const people = useInfiniteQuery(
    memberQueries.list(orgId, { status: 'active', limit: PEOPLE_LIMIT }),
  )
  const { data: me } = useQuery(meQueries.current())
  const add = useAddInstallAdminMutation({ silent: true })
  const remove = useRemoveInstallAdminMutation({ silent: true })
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [toRemove, setToRemove] = useState<InstallAdminDto | null>(null)

  const adminIds = new Set((admins.data?.items ?? []).map((admin) => admin.user.id))
  return {
    admins: admins.data?.items ?? [],
    isLoading: admins.isPending,
    errorMessage: admins.error ? getErrorMessage(admins.error, tErrors) : null,
    errorReference: isApiError(admins.error) ? admins.error.requestId : undefined,
    refetch: () => void admins.refetch(),
    currentUserId: me?.user.id,
    options: (people.data?.pages.flatMap((page) => page.items) ?? [])
      .filter((member) => !adminIds.has(member.user.id))
      .map((member) => ({
        value: member.user.id,
        label: member.user.name,
        description: member.user.email,
      })),
    selectedUserId,
    onSelectedChange: setSelectedUserId,
    isAdding: add.isPending,
    addError: add.error ? getErrorMessage(add.error, tErrors) : null,
    onAdd: () => {
      if (!selectedUserId) return
      add.mutate(
        { userId: selectedUserId },
        {
          onSuccess: () => {
            setSelectedUserId(null)
            toast.success(t('added'))
          },
        },
      )
    },
    toRemove,
    onAskRemove: setToRemove,
    onCloseRemove: () => {
      setToRemove(null)
    },
    removeError: remove.error ? getErrorMessage(remove.error, tErrors) : undefined,
    onRemove: async () => {
      if (!toRemove) return
      await remove.mutateAsync(toRemove.user.id)
      toast.success(t('removed', { name: toRemove.user.name }))
    },
    t,
  }
}
