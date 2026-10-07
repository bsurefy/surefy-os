// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useTranslations } from 'next-intl'

import { InputOTP, InputOTPGroup, InputOTPSlot } from '@surefy/ui/primitives/input-otp'

import { TWO_FACTOR_CODE_LENGTH } from '../Auth.constants'

/** Six digits, paste-friendly; `onComplete` fires when the last digit is in. */
export default function TwoFactorCodeInput({
  value,
  onChange,
  onComplete,
  isDisabled = false,
}: Readonly<{
  value: string
  onChange: (value: string) => void
  onComplete: (value: string) => void
  isDisabled?: boolean
}>) {
  const t = useTranslations('auth.twoFactorCode')
  return (
    <InputOTP
      maxLength={TWO_FACTOR_CODE_LENGTH}
      inputMode="numeric"
      autoComplete="one-time-code"
      autoFocus
      aria-label={t('label')}
      value={value}
      disabled={isDisabled}
      onChange={onChange}
      onComplete={onComplete}
    >
      <InputOTPGroup>
        {Array.from({ length: TWO_FACTOR_CODE_LENGTH }, (_, index) => (
          <InputOTPSlot key={index} index={index} />
        ))}
      </InputOTPGroup>
    </InputOTP>
  )
}
