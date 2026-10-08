// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQueryClient } from '@tanstack/react-query'

import type {
  CreateGuardrailInput,
  CreatePiiRuleInput,
  LockGuardrailInput,
  TestDataFilterInput,
  UpdateGuardSettingsInput,
  UpdateGuardrailInput,
  UpdatePiiRuleInput,
} from '@surefy/contracts'
import { apiClient } from '@surefy/web-core/http'
import type { MutationHookOptions } from '@surefy/web-core/query'

import { guardApi } from './guard.api'
import { guardKeys } from './guard.queries'

/** Defaults feed the agent editors' effective values and the overview's attention list. */
export function useUpdateGuardDefaultsMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const queryClient = useQueryClient()
  return useMutation({
    meta: { silent },
    mutationFn: (input: UpdateGuardSettingsInput) =>
      guardApi.updateDefaults(apiClient, orgId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: guardKeys.all(orgId) }),
  })
}

export function useCreateGuardrailMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const queryClient = useQueryClient()
  return useMutation({
    meta: { silent },
    mutationFn: (input: CreateGuardrailInput) => guardApi.createGuardrail(apiClient, orgId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: guardKeys.all(orgId) }),
  })
}

export function useUpdateGuardrailMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const queryClient = useQueryClient()
  return useMutation({
    meta: { silent },
    mutationFn: ({ guardrailId, ...input }: UpdateGuardrailInput & { guardrailId: string }) =>
      guardApi.updateGuardrail(apiClient, orgId, guardrailId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: guardKeys.all(orgId) }),
  })
}

export function useDeleteGuardrailMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const queryClient = useQueryClient()
  return useMutation({
    meta: { silent },
    mutationFn: ({ guardrailId, reason }: { guardrailId: string; reason?: string }) =>
      guardApi.deleteGuardrail(apiClient, orgId, guardrailId, reason),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: guardKeys.all(orgId) }),
  })
}

export function useLockGuardrailMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const queryClient = useQueryClient()
  return useMutation({
    meta: { silent },
    mutationFn: ({ guardrailId, ...input }: LockGuardrailInput & { guardrailId: string }) =>
      guardApi.lockGuardrail(apiClient, orgId, guardrailId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: guardKeys.all(orgId) }),
  })
}

export function useUnlockGuardrailMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const queryClient = useQueryClient()
  return useMutation({
    meta: { silent },
    mutationFn: (guardrailId: string) => guardApi.unlockGuardrail(apiClient, orgId, guardrailId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: guardKeys.all(orgId) }),
  })
}

export function useCreatePiiRuleMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const queryClient = useQueryClient()
  return useMutation({
    meta: { silent },
    mutationFn: (input: CreatePiiRuleInput) => guardApi.createPiiRule(apiClient, orgId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: guardKeys.all(orgId) }),
  })
}

export function useUpdatePiiRuleMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const queryClient = useQueryClient()
  return useMutation({
    meta: { silent },
    mutationFn: ({ ruleId, ...input }: UpdatePiiRuleInput & { ruleId: string }) =>
      guardApi.updatePiiRule(apiClient, orgId, ruleId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: guardKeys.all(orgId) }),
  })
}

export function useDeletePiiRuleMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const queryClient = useQueryClient()
  return useMutation({
    meta: { silent },
    mutationFn: ({ ruleId, reason }: { ruleId: string; reason?: string }) =>
      guardApi.deletePiiRule(apiClient, orgId, ruleId, reason),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: guardKeys.all(orgId) }),
  })
}

/** "Try it" only reads: nothing is saved and nothing is invalidated. */
export function useTestDataFilterMutation(
  orgId: string,
  { silent = true }: MutationHookOptions = {},
) {
  return useMutation({
    meta: { silent },
    mutationFn: (input: TestDataFilterInput) => guardApi.testDataFilter(apiClient, orgId, input),
  })
}
