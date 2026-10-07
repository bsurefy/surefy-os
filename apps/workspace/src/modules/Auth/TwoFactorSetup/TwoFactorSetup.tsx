// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Banner } from '@surefy/ui/components/Feedback'
import { Field } from '@surefy/ui/components/Forms'
import { Button } from '@surefy/ui/primitives/button'
import { Checkbox } from '@surefy/ui/primitives/checkbox'
import { Label } from '@surefy/ui/primitives/label'

import AuthCard from '../AuthCard'
import PasswordInput from '../PasswordInput'
import TwoFactorCodeInput from '../TwoFactorCodeInput'
import { TWO_FACTOR_SETUP_STEP } from './TwoFactorSetup.constants'
import { useTwoFactorSetupController } from './TwoFactorSetup.controller'

import type { TwoFactorSetupProps } from './TwoFactorSetup.types'

/** Set up two-factor: authenticator, then recovery codes shown once with Download. */
export default function TwoFactorSetup(props: Readonly<TwoFactorSetupProps>) {
  const c = useTwoFactorSetupController(props)
  const { t } = c

  if (c.step === TWO_FACTOR_SETUP_STEP.PASSWORD) {
    return (
      <AuthCard title={t('title')} description={t('password.description')}>
        <form noValidate onSubmit={c.onSubmitPassword} className="flex flex-col gap-4">
          {c.formError && <Banner tone="destructive" title={c.formError} isAnnounced />}
          <Field label={t('password.label')} error={c.passwordError}>
            <PasswordInput autoComplete="current-password" autoFocus {...c.register('password')} />
          </Field>
          <Button type="submit" isLoading={c.isPending}>
            {t('password.submit')}
          </Button>
        </form>
      </AuthCard>
    )
  }

  if (c.step === TWO_FACTOR_SETUP_STEP.SCAN) {
    return (
      <AuthCard title={t('title')} description={t('description')}>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-label">{t('scan.secretLabel')}</span>
            <code className="bg-surface-2 text-body rounded-lg px-3 py-2 font-mono break-all select-all">
              {c.secret}
            </code>
            <Button asChild variant="link" className="self-start">
              <a href={c.totpUri}>{t('scan.openApp')}</a>
            </Button>
          </div>
          {c.codeError && <Banner tone="destructive" title={c.codeError} isAnnounced />}
          <div className="flex flex-col gap-1.5">
            <span className="text-label">{t('scan.codeLabel')}</span>
            <TwoFactorCodeInput
              value={c.code}
              onChange={c.onCodeChange}
              onComplete={c.onCodeComplete}
              isDisabled={c.isVerifying}
            />
          </div>
        </div>
      </AuthCard>
    )
  }

  return (
    <AuthCard title={t('codes.title')} description={t('codes.description')}>
      <div className="flex flex-col gap-4">
        <ul className="bg-surface-2 grid grid-cols-2 gap-2 rounded-lg p-4 font-mono">
          {c.recoveryCodes.map((recoveryCode) => (
            <li key={recoveryCode}>{recoveryCode}</li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={c.onDownload}>
            {t('codes.download')}
          </Button>
          <Button variant="secondary" onClick={() => void c.onCopy()}>
            {t('codes.copy')}
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="recovery-codes-saved"
            checked={c.hasSavedCodes}
            onCheckedChange={(checked) => {
              c.onHasSavedCodesChange(checked === true)
            }}
          />
          <Label htmlFor="recovery-codes-saved">{t('codes.saved')}</Label>
        </div>
        <Button onClick={c.onDone} aria-disabled={!c.hasSavedCodes}>
          {t('codes.done')}
        </Button>
      </div>
    </AuthCard>
  )
}
