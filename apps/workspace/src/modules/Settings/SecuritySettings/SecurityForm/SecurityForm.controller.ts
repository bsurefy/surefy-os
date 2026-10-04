// SPDX-License-Identifier: AGPL-3.0-only
'use no memo'

import { useInfiniteQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { memberQueries } from '@/api/members'
import { useUpdateOrganizationMutation } from '@/api/organizations'
import type { OrganizationDto } from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'
import { getErrorMessage } from '@surefy/web-core/errors'
import { useForm } from '@surefy/web-core/forms'

import { MEMBER_COUNT_LIMIT, SESSION_LENGTH_OPTIONS } from '../SecuritySettings.constants'
import { securitySettingsSchema } from '../SecuritySettings.schema'
import {
  isTwoFactorTurnedOn,
  sessionLengthToHours,
  toSecuritySettingsValues,
} from '../SecuritySettings.utils'

import type { SecuritySettingsValues } from '../SecuritySettings.schema'
import type { BaseSyntheticEvent } from 'react'

/**
 * The Security form with the sticky save bar. Turning the two-factor requirement on is T2: the
 * dialog says how many people will have to set it up at their next sign-in.
 */
export function useSecurityFormController({ organization }: { organization: OrganizationDto }) {
  const t = useTranslations('settings.security')
  const tErrors = useTranslations('errors')
  const mutation = useUpdateOrganizationMutation(organization.id, { silent: true })
  const [pending, setPending] = useState<SecuritySettingsValues | null>(null)
  const form = useForm({
    schema: securitySettingsSchema,
    defaultValues: toSecuritySettingsValues(organization),
  })
  const people = useInfiniteQuery({
    ...memberQueries.list(organization.id, { status: 'active', limit: MEMBER_COUNT_LIMIT }),
    enabled: pending !== null,
  })
  const withoutTwoFactor = (people.data?.pages.flatMap((page) => page.items) ?? []).filter(
    (member) => !member.twoFactorEnabled,
  ).length

  const save = async (values: SecuritySettingsValues) => {
    try {
      const updated = await mutation.mutateAsync({
        settings: {
          security: {
            require2fa: values.require2fa,
            sessionMaxHours: sessionLengthToHours(values.sessionLength),
          },
        },
      })
      form.reset(toSecuritySettingsValues(updated))
      toast.success(t('saved'))
    } catch (error) {
      form.setError('root', { message: getErrorMessage(error, tErrors) })
    }
  }

  const submit = form.handleSubmit(async (values) => {
    if (isTwoFactorTurnedOn(organization, values)) {
      setPending(values)
      return
    }
    await save(values)
  })

  return {
    form,
    onSubmit: (event: BaseSyntheticEvent) => {
      void submit(event)
    },
    isDirty: form.formState.isDirty,
    changeCount: Object.keys(form.formState.dirtyFields).length,
    isSaving: mutation.isPending,
    formError: form.formState.errors.root?.message,
    onDiscard: () => {
      form.reset(toSecuritySettingsValues(organization))
    },
    sessionOptions: SESSION_LENGTH_OPTIONS.map((value) => ({
      value,
      label: t(`sessionLength.options.${value}`),
    })),
    confirm: {
      open: pending !== null,
      onOpenChange: (open: boolean) => {
        if (!open) setPending(null)
      },
      isCounting: people.isPending,
      withoutTwoFactor,
      onConfirm: async () => {
        if (pending) await save(pending)
        setPending(null)
      },
    },
    t,
  }
}
