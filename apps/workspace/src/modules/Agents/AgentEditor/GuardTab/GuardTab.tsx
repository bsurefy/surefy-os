// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import ApprovalRuleDialog from './ApprovalRuleDialog'
import ApprovalRulesSection from './ApprovalRulesSection'
import BlockedActionsSection from './BlockedActionsSection'
import { useGuardTabController } from './GuardTab.controller'
import { useApproverDirectory } from './GuardTab.hooks'
import InheritedGuard from './InheritedGuard'
import ThresholdsSection from './ThresholdsSection'

import type { GuardTabProps } from './GuardTab.types'

/**
 * Guard: what the organization's Guard already decides (locked rows), this agent's thresholds
 * (as strict or stricter), its approval rules and its blocked actions.
 */
export default function GuardTab(props: Readonly<GuardTabProps>) {
  const c = useGuardTabController(props)
  const directory = useApproverDirectory()

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <InheritedGuard
        settings={c.settings}
        rules={c.inheritedRules}
        isLoading={c.organizationLoad.isLoading}
        errorMessage={c.organizationLoad.errorMessage}
        errorReference={c.organizationLoad.errorReference}
        onRetry={c.organizationLoad.refetch}
      />
      <ThresholdsSection
        organization={c.organization}
        own={c.own}
        isOutdated={c.isOutdated}
        isReadOnly={c.isReadOnly}
        onUseOrganization={c.onUseOrganization}
        onChange={c.onThresholdsChange}
        onRaise={c.onRaise}
      />
      <ApprovalRulesSection
        rules={c.approvalRules}
        suggestedTools={c.unguardedTools}
        labelOf={directory.labelOf}
        isReadOnly={c.isReadOnly}
        onAdd={c.onAddRule}
        onEdit={c.onEditRule}
        onRemove={c.onRemoveRule}
      />
      <BlockedActionsSection
        blocked={c.blockedActions}
        isReadOnly={c.isReadOnly}
        onAdd={c.onAddBlocked}
        onRemove={c.onRemoveBlocked}
      />
      {c.dialog && (
        <ApprovalRuleDialog
          rule={c.dialog.rule}
          action={c.dialog.action}
          toolNames={props.definition.tools.filter((tool) => tool.enabled).map((tool) => tool.name)}
          onSave={c.onSaveRule}
          onClose={c.onCloseDialog}
        />
      )}
    </div>
  )
}
