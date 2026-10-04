// SPDX-License-Identifier: AGPL-3.0-only
import { useTranslations } from 'next-intl'

import type { UserDto } from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'
import { useUpdateMeMutation } from '@surefy/web-core/api/me'
import { useForm } from '@surefy/web-core/forms'

import { profileDetailsSchema } from './ProfileDetails.schema'

import type { ProfileDetailsValues } from './ProfileDetails.schema'
import type { BaseSyntheticEvent } from 'react'

/** The name form; a failed save shows the global error toast, a saved one a success toast. */
export function useProfileDetailsController({ user }: { user: UserDto }) {
  const t = useTranslations('workspace.profile.details')
  const tCommon = useTranslations('common')
  const form = useForm({ schema: profileDetailsSchema, defaultValues: { name: user.name } })
  const { mutate, isPending } = useUpdateMeMutation()

  const submit = form.handleSubmit((values: ProfileDetailsValues) => {
    mutate(values, {
      onSuccess: (me) => {
        form.reset({ name: me.user.name })
        toast.success(t('saved'))
      },
    })
  })

  const onSubmit = (event: BaseSyntheticEvent) => {
    void submit(event)
  }

  return {
    register: form.register,
    nameError: form.formState.errors.name?.message,
    isDirty: form.formState.isDirty,
    isPending,
    onSubmit,
    email: user.email,
    isEmailVerified: user.emailVerified,
    t,
    tCommon,
  }
}
