// SPDX-License-Identifier: AGPL-3.0-only
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { guardQueries } from '@/api/guard'
import type { AgentGuard } from '@surefy/contracts'
import { useCurrentOrgId } from '@surefy/web-core/access'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'

import { INHERITED_RULES_LIMIT, INHERITED_SCOPES } from './GuardTab.constants'
import {
  isLooserThan,
  newRuleId,
  raiseToOrganization,
  toBasisPoints,
  toPercent,
} from './GuardTab.utils'

import type { GuardTabProps } from './GuardTab.types'
import type { Thresholds } from './GuardTab.utils'

type ApprovalRule = AgentGuard['approvalRules'][number]

/** The rule being edited in the dialog: a new one (maybe for a given action) or an existing one. */
export type ApprovalRuleDialogState = { rule: ApprovalRule | null; action: string } | null

/**
 * Guard: what the organization's Guard already decides (locked), the agent's own thresholds, which
 * can only be as strict or stricter, its approval rules and its blocked actions. Every change is
 * an edit of the working copy, saved by autosave like any other tab.
 */
export function useGuardTabController({
  definition,
  onDefinitionChange,
  isReadOnly,
}: GuardTabProps) {
  const t = useTranslations('agents.editor.guard')
  const tErrors = useTranslations('errors')
  const orgId = useCurrentOrgId()
  const settings = useQuery(guardQueries.defaults(orgId))
  const inherited = useInfiniteQuery(
    guardQueries.rules(orgId, { scope: INHERITED_SCOPES, limit: INHERITED_RULES_LIMIT }),
  )
  const [dialog, setDialog] = useState<ApprovalRuleDialogState>(null)
  const { guard } = definition

  const organization: Thresholds | null = settings.data
    ? { autoBp: settings.data.autoThresholdBp, reviewBp: settings.data.reviewThresholdBp }
    : null

  const update = (change: (current: AgentGuard) => Partial<AgentGuard>) => {
    onDefinitionChange((current) => ({
      ...current,
      guard: { ...current.guard, ...change(current.guard) },
    }))
  }

  const setThresholds = (own: Thresholds | null) => {
    if (!organization) return
    // never below the organization's, and review never above automatic
    update(() => ({ thresholds: own && raiseToOrganization(organization, own) }))
  }

  // tools that can act should have an approval rule; each one is suggested
  const unguardedTools = definition.tools.filter(
    (tool) =>
      tool.enabled &&
      tool.permission === 'can_act' &&
      !guard.approvalRules.some((rule) => rule.match.action === tool.name),
  )

  const failure = settings.error ?? inherited.error
  return {
    t,
    isReadOnly,
    organizationLoad: {
      isLoading: settings.isPending || inherited.isPending,
      errorMessage: failure ? getErrorMessage(failure, tErrors) : null,
      errorReference: isApiError(failure) ? failure.requestId : undefined,
      refetch: () => {
        void settings.refetch()
        void inherited.refetch()
      },
    },
    settings: settings.data ?? null,
    inheritedRules: inherited.data?.pages.flatMap((page) => page.items) ?? [],
    organization,
    own: guard.thresholds,
    isOutdated:
      organization !== null &&
      guard.thresholds !== null &&
      isLooserThan(organization, guard.thresholds),
    percent: { toPercent, toBasisPoints },
    onUseOrganization: (shouldFollow: boolean) => {
      setThresholds(shouldFollow ? null : organization)
    },
    onThresholdsChange: setThresholds,
    onRaise: () => {
      if (organization && guard.thresholds)
        setThresholds(raiseToOrganization(organization, guard.thresholds))
    },
    approvalRules: guard.approvalRules,
    blockedActions: guard.blockedActions,
    unguardedTools,
    dialog,
    onAddRule: (action = '') => {
      setDialog({ rule: null, action })
    },
    onEditRule: (rule: ApprovalRule) => {
      setDialog({ rule, action: rule.match.action })
    },
    onCloseDialog: () => {
      setDialog(null)
    },
    onSaveRule: (rule: ApprovalRule) => {
      update((current) => ({
        approvalRules: current.approvalRules.some((existing) => existing.id === rule.id)
          ? current.approvalRules.map((existing) => (existing.id === rule.id ? rule : existing))
          : [...current.approvalRules, rule],
      }))
      setDialog(null)
    },
    onRemoveRule: (ruleId: string) => {
      update((current) => ({
        approvalRules: current.approvalRules.filter((rule) => rule.id !== ruleId),
      }))
    },
    onAddBlocked: (action: string) => {
      const name = action.trim()
      if (name === '') return
      update((current) => ({
        blockedActions: current.blockedActions.some(
          (blocked) => blocked.match.action.toLowerCase() === name.toLowerCase(),
        )
          ? current.blockedActions
          : [...current.blockedActions, { id: newRuleId(), match: { action: name } }],
      }))
    },
    onRemoveBlocked: (blockedId: string) => {
      update((current) => ({
        blockedActions: current.blockedActions.filter((blocked) => blocked.id !== blockedId),
      }))
    },
  }
}
