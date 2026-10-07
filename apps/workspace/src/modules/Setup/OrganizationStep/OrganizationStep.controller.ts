// SPDX-License-Identifier: AGPL-3.0-only
'use no memo'

import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { organizationQueries } from '@/api/organizations'
import { useRunSetupMutation } from '@/api/setup'
import { ERROR_CODES, ORGANIZATION_SLUG_PATTERN, SUPPORTED_LOCALES } from '@surefy/contracts'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'
import { SERVER_ISSUE_KEY_PREFIX, useForm } from '@surefy/web-core/forms'

import { organizationStepSchema } from './OrganizationStep.schema'
import { SETUP_TOKEN_MIN_LENGTH, SLUG_CHECK_DELAY_MS } from '../Setup.constants'
import { getBrowserTimeZone, useDebouncedValue, useFieldErrorText, useHost } from '../Setup.hooks'
import { slugFromName } from '../Setup.utils'

import type { OrganizationStepValues } from './OrganizationStep.schema'
import type { SetupOrganization } from '../Setup.types'
import type { BaseSyntheticEvent, ChangeEvent } from 'react'

export interface OrganizationStepProps {
  requiresToken: boolean
  onBack: () => void
  onCreated: (organization: SetupOrganization) => void
  /** Setup was completed meanwhile (another tab, another person). */
  onAlreadyComplete: () => void
}

type SlugStatus = 'idle' | 'checking' | 'available' | 'taken' | 'reserved' | 'invalid'

/** Where the server reports a field of the request on this form. */
const FIELD_OF_PATH: Record<string, keyof OrganizationStepValues> = {
  'organization.name': 'organizationName',
  'organization.slug': 'slug',
  'owner.name': 'ownerName',
  'owner.email': 'email',
  'owner.password': 'password',
}

/**
 * Organization & owner: the slug follows the name until it is edited, then is checked against the
 * server as it rests. Submitting creates the organization and the Owner and signs them in.
 */
export function useOrganizationStepController({
  requiresToken,
  onCreated,
  onAlreadyComplete,
}: Pick<OrganizationStepProps, 'requiresToken' | 'onCreated' | 'onAlreadyComplete'>) {
  const t = useTranslations('setup.organization')
  const tErrors = useTranslations('errors')
  const fieldErrorText = useFieldErrorText()
  const host = useHost()
  const run = useRunSetupMutation({ silent: true })
  const form = useForm({
    schema: organizationStepSchema,
    defaultValues: {
      organizationName: '',
      slug: '',
      token: '',
      ownerName: '',
      email: '',
      password: '',
      locale: SUPPORTED_LOCALES[0],
    } satisfies OrganizationStepValues,
  })

  const slug = form.watch('slug')
  const checkedSlug = useDebouncedValue(slug, SLUG_CHECK_DELAY_MS)
  const isChecking = ORGANIZATION_SLUG_PATTERN.test(checkedSlug) && checkedSlug === slug
  const availability = useQuery({
    ...organizationQueries.slugAvailability(checkedSlug),
    enabled: isChecking,
  })

  // the address follows the name until the person edits it; an emptied address follows it again
  const [isSlugEdited, setIsSlugEdited] = useState(false)
  const nameField = form.register('organizationName', {
    onChange: (event: ChangeEvent<HTMLInputElement>) => {
      if (isSlugEdited) return
      form.setValue('slug', slugFromName(event.target.value))
    },
  })
  const slugField = form.register('slug', {
    onChange: (event: ChangeEvent<HTMLInputElement>) => {
      setIsSlugEdited(event.target.value !== '')
    },
  })

  const applyServerError = (error: unknown) => {
    if (!isApiError(error)) throw error
    if (error.code === ERROR_CODES.SETUP_ALREADY_COMPLETED) {
      onAlreadyComplete()
      return
    }
    if (error.code === ERROR_CODES.SETUP_TOKEN_INVALID) {
      form.setError('token', { message: getErrorMessage(error, tErrors) })
      return
    }
    if (
      error.code === ERROR_CODES.ORGANIZATION_SLUG_TAKEN ||
      error.code === ERROR_CODES.ORGANIZATION_SLUG_RESERVED
    ) {
      form.setError('slug', { message: getErrorMessage(error, tErrors) })
      return
    }
    const fieldDetails = error.details.filter((detail) => FIELD_OF_PATH[detail.path] !== undefined)
    if (error.code === ERROR_CODES.VALIDATION_FAILED && fieldDetails.length > 0) {
      for (const { path, code } of fieldDetails) {
        const field = FIELD_OF_PATH[path]
        if (field === undefined) continue
        form.setError(field, {
          message:
            field === 'email' && code === 'taken'
              ? t('ownerEmailTaken')
              : `${SERVER_ISSUE_KEY_PREFIX}${code}`,
        })
      }
      return
    }
    form.setError('root', { message: getErrorMessage(error, tErrors) })
  }

  const submit = form.handleSubmit(async (values) => {
    if (requiresToken && values.token.length < SETUP_TOKEN_MIN_LENGTH) {
      form.setError('token', { message: t('tokenInvalid') })
      return
    }
    try {
      const result = await run.mutateAsync({
        token: requiresToken ? values.token : undefined,
        organization: {
          name: values.organizationName,
          slug: values.slug,
          timezone: getBrowserTimeZone(),
        },
        owner: { name: values.ownerName, email: values.email, password: values.password },
        locale: values.locale,
      })
      onCreated({
        id: result.organization.id,
        name: result.organization.name,
        slug: result.organization.slug,
      })
    } catch (error) {
      applyServerError(error)
    }
  })

  const { errors } = form.formState
  return {
    form,
    nameField,
    slugField,
    host,
    slug,
    password: form.watch('password'),
    locale: form.watch('locale'),
    localeOptions: SUPPORTED_LOCALES.map((value) => ({ value, label: t(`languages.${value}`) })),
    slugStatus: getSlugStatus(slug, isChecking, availability),
    errors: {
      organizationName: fieldErrorText(errors.organizationName?.message),
      slug: fieldErrorText(errors.slug?.message),
      token: fieldErrorText(errors.token?.message),
      ownerName: fieldErrorText(errors.ownerName?.message),
      email: fieldErrorText(errors.email?.message),
      password: fieldErrorText(errors.password?.message),
    },
    formError: errors.root?.message,
    isPending: form.formState.isSubmitting,
    onSubmit: (event: BaseSyntheticEvent) => {
      void submit(event)
    },
    t,
  }
}

function getSlugStatus(
  slug: string,
  isChecking: boolean,
  availability: { isFetching: boolean; data?: { available: boolean; reason: string | null } },
): SlugStatus {
  if (slug === '') return 'idle'
  if (!ORGANIZATION_SLUG_PATTERN.test(slug)) return 'invalid'
  if (!isChecking || availability.isFetching) return 'checking'
  if (!availability.data) return 'idle'
  if (availability.data.available) return 'available'
  return availability.data.reason === 'reserved' ? 'reserved' : 'taken'
}
