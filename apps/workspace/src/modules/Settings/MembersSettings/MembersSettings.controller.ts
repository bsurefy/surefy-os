// SPDX-License-Identifier: AGPL-3.0-only
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { debounce, useQueryStates } from 'nuqs'
import { useState } from 'react'

import { memberQueries } from '@/api/members'
import { teamQueries } from '@/api/teams'
import { PERMISSIONS } from '@surefy/contracts'
import type { MemberStatus } from '@surefy/contracts'
import type { DataTableSelection } from '@surefy/ui/components/DataDisplay'
import { useCan, useCurrentOrgId } from '@surefy/web-core/access'
import { meQueries } from '@surefy/web-core/api/me'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'

import { INVITATIONS_PAGE_SIZE, MEMBER_STATUS_FILTERS } from './MembersSettings.constants'
import { membersSearchParams } from './MembersSettings.searchParams'
import { buildMemberRows, getSelectedMemberIds } from './MembersSettings.utils'

import type { MemberDialogKind } from './MembersSettings.constants'
import type { MemberRow } from './MembersSettings.types'

const SEARCH_DEBOUNCE_MS = 300
const FILTER_TEAMS_LIMIT = 100

export interface OpenDialog {
  kind: MemberDialogKind
  /** The row the dialog is about; none for the invite and bulk dialogs. */
  row?: MemberRow
}

/** Settings › Members: filters in the URL, the people and invitations as rows, and the open dialog. */
export function useMembersSettingsController() {
  const t = useTranslations('settings.members')
  const tErrors = useTranslations('errors')
  const orgId = useCurrentOrgId()
  const [filters, setFilters] = useQueryStates(membersSearchParams)
  const [selection, setSelection] = useState<DataTableSelection>({})
  const [dialog, setDialog] = useState<OpenDialog | null>(null)
  const canInvite = useCan(PERMISSIONS.MEMBERS_INVITE)
  const canManage = useCan(PERMISSIONS.MEMBERS_MANAGE)
  const canManageAdmins = useCan(PERMISSIONS.MEMBERS_MANAGE_ADMINS)
  const { data: me } = useQuery(meQueries.current())

  const { q, role, team, sort, status } = filters
  const wantsMembers = status !== 'invited'
  const wantsInvitations = status === 'all' || status === 'invited'
  const memberStatus: MemberStatus | undefined =
    status === 'active' || status === 'deactivated' ? status : undefined

  const people = useInfiniteQuery({
    ...memberQueries.list(orgId, {
      q: q || undefined,
      role: role ?? undefined,
      status: memberStatus,
      teamId: team ?? undefined,
      sort,
    }),
    enabled: wantsMembers,
  })
  const invitations = useInfiniteQuery({
    ...memberQueries.invitations(orgId, { q: q || undefined, limit: INVITATIONS_PAGE_SIZE }),
    enabled: wantsInvitations,
  })
  const teams = useInfiniteQuery(teamQueries.list(orgId, { limit: FILTER_TEAMS_LIMIT }))

  const rows = buildMemberRows(
    people.data?.pages.flatMap((page) => page.items) ?? [],
    invitations.data?.pages.flatMap((page) => page.items) ?? [],
    { role, teamId: team, status },
  )
  const error =
    (wantsMembers ? people.error : null) ?? (wantsInvitations ? invitations.error : null)
  const isLoading =
    (wantsMembers && people.isPending) || (wantsInvitations && invitations.isPending)
  const hasFilters = q !== '' || role !== null || team !== null || status !== 'all'

  return {
    orgId,
    filters,
    rows,
    isLoading,
    errorMessage: error ? getErrorMessage(error, tErrors) : null,
    errorReference: isApiError(error) ? error.requestId : undefined,
    refetch: () => {
      void people.refetch()
      void invitations.refetch()
    },
    hasMore: wantsMembers && people.hasNextPage,
    isLoadingMore: people.isFetchingNextPage,
    onLoadMore: () => void people.fetchNextPage(),
    hasFilters,
    teamOptions: (teams.data?.pages.flatMap((page) => page.items) ?? []).map((item) => ({
      value: item.id,
      label: item.name,
    })),
    statusOptions: MEMBER_STATUS_FILTERS.map((value) => ({
      value,
      label: t(`status.${value}`),
    })),
    onSearchChange: (value: string) =>
      void setFilters(
        { q: value || null },
        { limitUrlUpdates: debounce(SEARCH_DEBOUNCE_MS), history: 'replace' },
      ),
    onFiltersChange: setFilters,
    onClearFilters: () => {
      void setFilters({ q: null, role: null, team: null, status: null })
    },
    selection,
    onSelectionChange: setSelection,
    selectedMemberIds: getSelectedMemberIds(selection),
    canInvite,
    canManage,
    canManageAdmins,
    currentUserId: me?.user.id,
    dialog,
    openDialog: setDialog,
    closeDialog: () => {
      setDialog(null)
    },
    t,
  }
}
