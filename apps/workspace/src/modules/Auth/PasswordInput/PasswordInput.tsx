// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useTranslations } from 'next-intl'

import { SecretInput } from '@surefy/ui/components/Forms'

import type { ComponentProps } from 'react'

/** A password field with the show/hide toggle; `autoComplete` says which password it is. */
export default function PasswordInput({
  autoComplete,
  ...props
}: Readonly<
  Omit<ComponentProps<typeof SecretInput>, 'labels' | 'autoComplete'> & {
    autoComplete: 'current-password' | 'new-password'
  }
>) {
  const t = useTranslations('auth.password')
  return (
    <SecretInput
      labels={{ show: t('show'), hide: t('hide') }}
      autoComplete={autoComplete}
      {...props}
    />
  )
}
