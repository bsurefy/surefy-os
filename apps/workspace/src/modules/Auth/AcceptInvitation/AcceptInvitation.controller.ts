// SPDX-License-Identifier: AGPL-3.0-only
'use no memo'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

import { useAcceptInvitationMutation, useRequestInvitationReissueMutation } from '@/api/auth'
import { ROUTES } from '@/constants/routes'
import { authClient } from '@/core/auth/authClient'
import { useSignOut } from '@/core/auth/useSignOut'
import { toRoute } from '@/modules/Workspace'
import { getErrorMessage } from '@surefy/web-core/errors'
import { useForm } from '@surefy/web-core/forms'

import { useAuthErrorText, useFieldErrorText } from '../Auth.hooks'
import { savePendingEmail } from '../Auth.utils'
import { acceptInvitationSchema } from './AcceptInvitation.schema'
import { getInvitationErrorState, isSameEmail } from './AcceptInvitation.utils'

import type { AcceptInvitationProps } from './AcceptInvitation.types'
import type { BaseSyntheticEvent } from 'react'

/**
 * The invitation link: its state, then (by who is signed in) creating the account, accepting, or
 * switching account. Accepting needs a verified email that matches the invitation.
 */
export function useAcceptInvitationController({
  token,
  invitation,
  signedInAs,
}: AcceptInvitationProps) {
  const t = useTranslations('auth.acceptInvitation')
  const tErrors = useTranslations('errors')
  const router = useRouter()
  const signOut = useSignOut()
  const authErrorText = useAuthErrorText()
  const fieldErrorText = useFieldErrorText()
  const accept = useAcceptInvitationMutation()
  const reissue = useRequestInvitationReissueMutation()
  const form = useForm({
    schema: acceptInvitationSchema,
    defaultValues: { name: '', password: '' },
  })

  const submitAccount = form.handleSubmit(async (values) => {
    if (invitation === null) return
    const { error } = await authClient.signUp.email({
      name: values.name,
      email: invitation.email,
      password: values.password,
      callbackURL: ROUTES.auth.invite(token),
    })
    if (error) {
      form.setError('root', { message: authErrorText(error) })
      return
    }
    savePendingEmail(invitation.email)
    router.push(toRoute(ROUTES.auth.verifyEmail))
  })

  const isMatchingAccount =
    signedInAs !== null && invitation !== null && isSameEmail(signedInAs.email, invitation.email)

  const { errors } = form.formState
  return {
    invitation,
    errorState: getInvitationErrorState(invitation),
    signedInAs,
    isMatchingAccount,
    needsTwoFactorSetup:
      isMatchingAccount && invitation.requiresTwoFactor && !signedInAs.isTwoFactorEnabled,
    twoFactorSetupHref: toRoute(
      `${ROUTES.auth.twoFactorSetup}?redirect=${encodeURIComponent(ROUTES.auth.invite(token))}`,
    ),
    signInHref: toRoute(
      `${ROUTES.auth.login}?redirect=${encodeURIComponent(ROUTES.auth.invite(token))}`,
    ),
    register: form.register,
    nameError: fieldErrorText(errors.name?.message),
    passwordError: fieldErrorText(errors.password?.message),
    password: form.watch('password'),
    formError: errors.root?.message,
    isCreating: form.formState.isSubmitting,
    onSubmitAccount: (event: BaseSyntheticEvent) => {
      void submitAccount(event)
    },
    isAccepting: accept.isPending,
    acceptError: accept.error ? getErrorMessage(accept.error, tErrors) : null,
    onAccept: () => {
      accept.mutate(token, {
        onSuccess: (result) => {
          router.replace(toRoute(ROUTES.workspace.home(result.organization.slug)))
        },
      })
    },
    onSwitchAccount: () => {
      void signOut().then(() => {
        router.refresh()
      })
    },
    isReissueRequested: reissue.isSuccess,
    isRequestingReissue: reissue.isPending,
    onRequestReissue: () => {
      reissue.mutate(token)
    },
    t,
  }
}
