// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQueryClient } from '@tanstack/react-query'

import type { CreateDataRequestInput, CreateExportInput, ExportDto } from '@surefy/contracts'
import { apiClient } from '@surefy/web-core/http'
import type { MutationHookOptions } from '@surefy/web-core/query'

import { dataControlApi, exportsApi } from './dataControl.api'
import { dataControlKeys } from './dataControl.queries'

function useRefreshRequests(orgId: string) {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: dataControlKeys.requests(orgId) })
}

/** Asks for an export of all data, or schedules the organization's deletion (needs a reason). */
export function useCreateDataRequestMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const refresh = useRefreshRequests(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: (input: CreateDataRequestInput) => dataControlApi.create(apiClient, orgId, input),
    onSuccess: refresh,
  })
}

export function useCancelDataRequestMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const refresh = useRefreshRequests(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: (requestId: string) => dataControlApi.cancel(apiClient, orgId, requestId),
    onSuccess: refresh,
  })
}

export function useRetryDataRequestMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const refresh = useRefreshRequests(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: (requestId: string) => dataControlApi.retry(apiClient, orgId, requestId),
    onSuccess: refresh,
  })
}

/** The signed link is issued on click and the download is audited, so it is never cached. */
export function useDownloadDataRequestMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const refresh = useRefreshRequests(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: (requestId: string) => dataControlApi.download(apiClient, orgId, requestId),
    onSuccess: refresh,
  })
}

/** A started or retried export seeds its query, so polling starts from the answer. */
function useSeedExport(orgId: string) {
  const queryClient = useQueryClient()
  return (started: ExportDto) => {
    queryClient.setQueryData(dataControlKeys.export(orgId, started.id), started)
  }
}

export function useCreateExportMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const seed = useSeedExport(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: (input: CreateExportInput) => exportsApi.create(apiClient, orgId, input),
    onSuccess: seed,
  })
}

export function useRetryExportMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const seed = useSeedExport(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: (exportId: string) => exportsApi.retry(apiClient, orgId, exportId),
    onSuccess: seed,
  })
}

export function useDownloadExportMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  return useMutation({
    meta: { silent },
    mutationFn: (exportId: string) => exportsApi.download(apiClient, orgId, exportId),
  })
}
