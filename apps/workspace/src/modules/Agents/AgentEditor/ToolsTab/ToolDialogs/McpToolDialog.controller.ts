// SPDX-License-Identifier: AGPL-3.0-only
'use no memo'

import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { useDiscoverMcpActionsMutation } from '@/api/agents'
import { AGENT_TOOL_PERMISSIONS } from '@surefy/contracts'
import type { AgentMcpAction, AgentToolPermission } from '@surefy/contracts'
import { useCurrentOrgId } from '@surefy/web-core/access'
import { getErrorMessage } from '@surefy/web-core/errors'
import { useForm } from '@surefy/web-core/forms'

import { INHERIT_PERMISSION } from '../ToolsTab.constants'
import { changeAction, isNameTaken, mergeDiscoveredActions } from '../ToolsTab.utils'
import {
  createMcpToolFormSchema,
  emptyMcpToolValues,
  mcpToolToValues,
  toMcpTool,
} from './ToolDialogs.schema'

import type { McpToolDialogProps } from './ToolDialogs.types'
import type { BaseSyntheticEvent } from 'react'

/** An action's permission as the select holds it: `inherit` follows the tool's own. */
export const permissionValueOf = (action: AgentMcpAction): string =>
  action.permission ?? INHERIT_PERMISSION

/** The MCP server form, and the discovery of the actions the server offers. */
export function useMcpToolDialogController({
  tool,
  tools,
  onSave,
}: Pick<McpToolDialogProps, 'tool' | 'tools' | 'onSave'>) {
  const t = useTranslations('agents.editor.tools.mcpDialog')
  const tErrors = useTranslations('errors')
  const orgId = useCurrentOrgId()
  const { agentId } = useParams<{ agentId: string }>()
  const discover = useDiscoverMcpActionsMutation(orgId, agentId)
  const [actions, setActions] = useState<AgentMcpAction[]>(() => tool?.discoveredActions ?? [])
  const [schema] = useState(() =>
    createMcpToolFormSchema(
      {
        name: t('name.required'),
        nameTaken: t('name.taken'),
        url: t('url.invalid'),
      },
      (name) => isNameTaken(name, tools, tool?.id),
    ),
  )
  const form = useForm({
    schema,
    defaultValues: tool ? mcpToolToValues(tool) : emptyMcpToolValues(),
  })

  const submit = form.handleSubmit((values) => {
    onSave(toMcpTool(values, actions, tool))
  })

  const findActions = async () => {
    if (!(await form.trigger('serverUrl'))) return
    const { serverUrl, connectionId } = form.getValues()
    discover.mutate(
      { serverUrl, connectionId },
      {
        onSuccess: (found) => {
          if (found.ok) setActions((current) => mergeDiscoveredActions(found.actions, current))
        },
      },
    )
  }

  const reasonCode = discover.data && !discover.data.ok ? discover.data.reasonCode : null
  let failureMessage: string | null = null
  if (reasonCode !== null) {
    failureMessage = tErrors.has(reasonCode) ? tErrors(reasonCode) : tErrors('fallback')
  } else if (discover.error) {
    failureMessage = getErrorMessage(discover.error, tErrors)
  }

  return {
    t,
    form,
    actions,
    isFinding: discover.isPending,
    hasFound: discover.data?.ok === true,
    failureMessage,
    permissionOptions: [
      { value: INHERIT_PERMISSION, label: t('actions.inherit') },
      ...AGENT_TOOL_PERMISSIONS.map((value) => ({
        value,
        label: t(`actions.permission.${value}`),
      })),
    ],
    onFindActions: () => {
      void findActions()
    },
    onActionEnabledChange: (name: string, enabled: boolean) => {
      setActions((current) => changeAction(current, name, { enabled }))
    },
    onActionPermissionChange: (name: string, value: string) => {
      setActions((current) =>
        changeAction(current, name, {
          permission: value === INHERIT_PERMISSION ? null : (value as AgentToolPermission),
        }),
      )
    },
    onSubmit: (event: BaseSyntheticEvent) => {
      void submit(event)
    },
  }
}
