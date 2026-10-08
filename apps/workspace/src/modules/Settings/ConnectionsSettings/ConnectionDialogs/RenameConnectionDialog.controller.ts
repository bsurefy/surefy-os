// SPDX-License-Identifier: AGPL-3.0-only
'use no memo'

import { useTranslations } from 'next-intl'
import { useMemo } from 'react'

import { useUpdateConnectionMutation } from '@/api/connections'
import type { ConnectionDto } from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'
import { useForm } from '@surefy/web-core/forms'

import { createRenameSchema } from '../ConnectionsSettings.schema'

import type { RenameConnectionValues } from '../ConnectionsSettings.schema'
import type { BaseSyntheticEvent } from 'react'

/**
 * Renaming applies at once (T0). Custom APIs and MCP servers also change their address; the
 * service checks it again and refuses a plain `http://` host the install did not allow.
 */
export function useRenameConnectionController({
  orgId,
  connection,
  onClose,
}: {
  orgId: string
  connection: ConnectionDto
  onClose: () => void
}) {
  const t = useTranslations('settings.connections.rename')
  const tErrors = useTranslations('errors')
  const update = useUpdateConnectionMutation(orgId, { silent: true })
  const hasAddress = connection.baseUrl !== null
  const form = useForm({
    schema: useMemo(() => createRenameSchema(hasAddress), [hasAddress]),
    defaultValues: {
      name: connection.name,
      baseUrl: connection.baseUrl ?? '',
    } satisfies RenameConnectionValues,
  })

  const submit = form.handleSubmit(async (values) => {
    try {
      await update.mutateAsync({
        id: connection.id,
        name: values.name,
        ...(hasAddress && values.baseUrl !== connection.baseUrl ? { baseUrl: values.baseUrl } : {}),
      })
      toast.success(t('renamed', { name: values.name }))
      onClose()
    } catch (error) {
      if (!isApiError(error)) throw error
      form.setError('root', { message: getErrorMessage(error, tErrors) })
    }
  })

  return {
    t,
    form,
    hasAddress,
    formError: form.formState.errors.root?.message,
    isPending: form.formState.isSubmitting,
    onSubmit: (event: BaseSyntheticEvent) => {
      void submit(event)
    },
  }
}
