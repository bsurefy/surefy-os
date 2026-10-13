// SPDX-License-Identifier: AGPL-3.0-only
'use no memo'

import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { useFieldArray } from 'react-hook-form'

import { useTestAgentToolMutation } from '@/api/agents'
import { testAgentToolInputSchema } from '@surefy/contracts'
import { useCurrentOrgId } from '@surefy/web-core/access'
import { getErrorMessage } from '@surefy/web-core/errors'
import { useForm } from '@surefy/web-core/forms'

import { isNameTaken } from '../ToolsTab.utils'
import {
  apiToolToValues,
  createApiToolFormSchema,
  emptyApiToolValues,
  parseJsonObject,
  toApiTool,
} from './ToolDialogs.schema'

import type { ApiToolDialogProps } from './ToolDialogs.types'
import type { BaseSyntheticEvent } from 'react'

/** The API tool form, and the test call that sends the request as it stands in the form. */
export function useApiToolDialogController({
  tool,
  tools,
  onSave,
}: Pick<ApiToolDialogProps, 'tool' | 'tools' | 'onSave'>) {
  const t = useTranslations('agents.editor.tools.apiDialog')
  const tErrors = useTranslations('errors')
  const orgId = useCurrentOrgId()
  const { agentId } = useParams<{ agentId: string }>()
  const test = useTestAgentToolMutation(orgId, agentId)
  const [testArguments, setTestArguments] = useState('{}')
  const [testArgumentsError, setTestArgumentsError] = useState<string | null>(null)
  const [schema] = useState(() =>
    createApiToolFormSchema(
      {
        name: t('name.required'),
        nameTaken: t('name.taken'),
        url: t('url.invalid'),
        header: t('headers.invalid'),
        inputSchema: t('inputSchema.invalid'),
      },
      (name) => isNameTaken(name, tools, tool?.id),
    ),
  )
  const form = useForm({
    schema,
    defaultValues: tool ? apiToolToValues(tool) : emptyApiToolValues(),
  })
  const headers = useFieldArray({ control: form.control, name: 'headers' })
  const method = form.watch('method')

  const submit = form.handleSubmit((values) => {
    onSave(toApiTool(values, tool))
  })

  const runTest = async () => {
    // an empty box sends no arguments; anything else must be a JSON object
    const argumentsObject = parseJsonObject(testArguments)
    if (argumentsObject === undefined) {
      setTestArgumentsError(t('test.argumentsInvalid'))
      return
    }
    setTestArgumentsError(null)
    if (!(await form.trigger(['url', 'headers']))) return
    const values = form.getValues()
    const input = testAgentToolInputSchema.safeParse({
      method: values.method,
      url: values.url,
      headers: values.headers.filter((header) => header.name.trim() !== ''),
      connectionId: values.connectionId,
      arguments: argumentsObject ?? {},
    })
    if (input.success) test.mutate(input.data)
  }

  return {
    t,
    form,
    headers,
    method,
    changesData: method !== 'GET',
    testArguments,
    testArgumentsError,
    test: {
      result: test.data ?? null,
      isRunning: test.isPending,
      errorMessage: test.error ? getErrorMessage(test.error, tErrors) : null,
    },
    onTestArgumentsChange: (value: string) => {
      setTestArguments(value)
      setTestArgumentsError(null)
    },
    onRunTest: () => {
      void runTest()
    },
    onSubmit: (event: BaseSyntheticEvent) => {
      void submit(event)
    },
  }
}
