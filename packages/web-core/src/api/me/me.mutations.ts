// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQueryClient } from '@tanstack/react-query'

import type { UpdateMeInput } from '@surefy/contracts'

import { meApi } from './me.api'
import { meKeys } from './me.queries'
import { apiClient } from '../../http/apiClient'

import type { MutationHookOptions } from '../../query/query.types'

export function useUpdateMeMutation({ silent = false }: MutationHookOptions = {}) {
  const queryClient = useQueryClient()
  return useMutation({
    meta: { silent },
    mutationFn: (input: UpdateMeInput) => meApi.update(apiClient, input),
    onSuccess: (me) => {
      queryClient.setQueryData(meKeys.current(), me)
    },
  })
}
