// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@surefy/ui/primitives/dialog'

import { useAddConnectionController } from './AddConnectionDialog.controller'
import ChooseAppStep from './ChooseAppStep'
import ScopeStep from './ScopeStep'
import SignInStep from './SignInStep'
import { ADD_STEP, SIGN_IN_METHOD } from '../../ConnectionsSettings.constants'

import type { AddConnectionDialogProps } from './AddConnectionDialog.types'

/**
 * Add connection (three steps): choose the app, sign in, choose who can use it. Also opened from a
 * tool, channel or source that needs a connection, where it starts at step 2.
 */
export default function AddConnectionDialog(props: Readonly<AddConnectionDialogProps>) {
  const c = useAddConnectionController(props)
  const { t, provider } = c
  const appName = provider ? props.providerName(provider.providerKey) : ''

  const stepNumber = { [ADD_STEP.APP]: 1, [ADD_STEP.SIGN_IN]: 2, [ADD_STEP.SCOPE]: 3 }[c.step]
  const submitLabel =
    c.method === SIGN_IN_METHOD.OAUTH ? t('scope.continueWith', { app: appName }) : t('scope.save')

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{provider ? t('titleApp', { app: appName }) : t('title')}</DialogTitle>
          <DialogDescription>{t('step', { step: stepNumber, total: 3 })}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          {c.step === ADD_STEP.APP && (
            <ChooseAppStep
              providers={c.providers}
              isLoading={c.isLoadingProviders}
              error={c.providersError}
              onRetry={c.retryProviders}
              providerName={props.providerName}
              onChoose={c.onChooseProvider}
            />
          )}
          {c.step === ADD_STEP.SIGN_IN && provider && c.method && (
            <SignInStep
              // a different way of signing in is a different form
              key={`${provider.providerKey}:${c.method}`}
              provider={provider}
              providerName={appName}
              methods={c.methods}
              method={c.method}
              onMethodChange={c.onMethodChange}
              extraFields={c.extraFields}
              initialValues={c.values}
              canGoBack={c.canGoBackToApps}
              onBack={c.onBack}
              onSubmit={c.onSignedIn}
            />
          )}
          {c.step === ADD_STEP.SCOPE && (
            <ScopeStep
              allowedScopes={c.allowedScopes}
              scope={c.scope}
              onScopeChange={c.onScopeChange}
              teamOptions={c.teamOptions}
              teamId={c.teamId}
              onTeamChange={c.onTeamChange}
              isTeamsLoading={c.isTeamsLoading}
              error={c.error}
              isDuplicate={c.isDuplicate}
              isSaving={c.isSaving}
              canSave={c.canSave}
              submitLabel={submitLabel}
              onBack={c.onBack}
              onSave={() => void c.onSave()}
              onShowConnections={props.onClose}
            />
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
