// SPDX-License-Identifier: AGPL-3.0-only
'use no memo'

import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { organizationQueries, useUpdateOrganizationMutation } from '@/api/organizations'
import { ROUTES, SETTINGS_SECTION } from '@/constants/routes'
import { toRoute } from '@/modules/Workspace'
import { ERROR_CODES, SUPPORTED_LOCALES } from '@surefy/contracts'
import type { OrganizationDto } from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'
import { useForm } from '@surefy/web-core/forms'

import { SLUG_CHECK_DELAY_MS, SLUG_REDIRECT_DAYS } from '../GeneralSettings.constants'
import { useDebouncedValue } from '../GeneralSettings.hooks'
import { generalSettingsSchema } from '../GeneralSettings.schema'
import { getTimeZones, isCheckableSlug, toGeneralSettingsValues } from '../GeneralSettings.utils'

import type { GeneralSettingsValues } from '../GeneralSettings.schema'
import type { BaseSyntheticEvent } from 'react'

const SLUG_ERROR_CODES: readonly string[] = [
  ERROR_CODES.ORGANIZATION_SLUG_TAKEN,
  ERROR_CODES.ORGANIZATION_SLUG_RESERVED,
]

/**
 * The General form with the sticky save bar. Changing the URL slug is T2: saving it asks first,
 * and after the save the page moves to the new address.
 */
export function useGeneralSettingsFormController({
  organization,
}: {
  organization: OrganizationDto
}) {
  const t = useTranslations('settings.general')
  const tErrors = useTranslations('errors')
  const router = useRouter()
  const mutation = useUpdateOrganizationMutation(organization.id, { silent: true })
  const [pending, setPending] = useState<GeneralSettingsValues | null>(null)
  const form = useForm({
    schema: generalSettingsSchema,
    defaultValues: toGeneralSettingsValues(organization),
  })

  const slug = form.watch('slug')
  const checkedSlug = useDebouncedValue(slug, SLUG_CHECK_DELAY_MS)
  const isChecking = isCheckableSlug(checkedSlug, organization.slug) && checkedSlug === slug
  const availability = useQuery({
    ...organizationQueries.slugAvailability(checkedSlug),
    enabled: isChecking,
  })

  const save = async (values: GeneralSettingsValues) => {
    try {
      const updated = await mutation.mutateAsync(values)
      form.reset(toGeneralSettingsValues(updated))
      toast.success(t('saved'))
      if (updated.slug !== organization.slug) {
        router.replace(toRoute(ROUTES.workspace.settings(updated.slug, SETTINGS_SECTION.GENERAL)))
      }
    } catch (error) {
      if (!isApiError(error)) throw error
      const message = getErrorMessage(error, tErrors)
      form.setError(SLUG_ERROR_CODES.includes(error.code) ? 'slug' : 'root', { message })
    }
  }

  const submit = form.handleSubmit(async (values) => {
    if (values.slug === organization.slug) {
      await save(values)
      return
    }
    setPending(values)
  })

  const { dirtyFields, errors } = form.formState
  return {
    form,
    onSubmit: (event: BaseSyntheticEvent) => {
      void submit(event)
    },
    isDirty: form.formState.isDirty,
    changeCount: Object.keys(dirtyFields).length,
    isSaving: mutation.isPending,
    formError: errors.root?.message,
    onDiscard: () => {
      form.reset(toGeneralSettingsValues(organization))
    },
    timeZoneOptions: getTimeZones().map((zone) => ({
      value: zone,
      label: zone.replaceAll('_', ' '),
    })),
    localeOptions: SUPPORTED_LOCALES.map((value) => ({ value, label: t(`languages.${value}`) })),
    slugStatus: availabilityStatus(isChecking, availability.isFetching, availability.data),
    slugConfirm: {
      open: pending !== null,
      onOpenChange: (open: boolean) => {
        if (!open) setPending(null)
      },
      newSlug: pending?.slug ?? '',
      onConfirm: async () => {
        if (pending) await save(pending)
        setPending(null)
      },
      redirectDays: SLUG_REDIRECT_DAYS,
    },
    t,
  }
}

function availabilityStatus(
  isChecking: boolean,
  isFetching: boolean,
  data: { available: boolean; reason: string | null } | undefined,
): 'idle' | 'checking' | 'available' | 'taken' | 'reserved' | 'invalid' {
  if (!isChecking) return 'idle'
  if (isFetching || !data) return 'checking'
  if (data.available) return 'available'
  return (data.reason ?? 'invalid') as 'taken' | 'reserved' | 'invalid'
}
