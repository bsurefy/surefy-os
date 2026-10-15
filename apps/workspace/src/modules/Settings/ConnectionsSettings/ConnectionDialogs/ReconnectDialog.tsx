// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import type { ConnectionDto } from '@surefy/contracts'
import { Banner } from '@surefy/ui/components/Feedback'
import { Button } from '@surefy/ui/primitives/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@surefy/ui/primitives/dialog'
import { Form } from '@surefy/ui/primitives/form'

import { useReconnectController } from './ReconnectDialog.controller'
import SignInFields from './SignInFields'

const FORM_ID = 'reconnect-connection-form'

/** Reconnect a connection whose sign-in expired, whose app rejects it, or whose account must change. */
export default function ReconnectDialog({
  orgId,
  connection,
  providerName,
  returnTo,
  onClose,
}: Readonly<{
  orgId: string
  connection: ConnectionDto
  providerName: string
  /** Where the browser returns to after an OAuth sign-in; Settings › Connections when omitted. */
  returnTo?: string
  onClose: () => void
}>) {
  const c = useReconnectController({ orgId, connection, returnTo, onClose })
  const { t } = c

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('title', { name: connection.name })}</DialogTitle>
          <DialogDescription>
            {c.isOauth
              ? t('oauthDescription', {
                  account: connection.externalAccountLabel ?? connection.name,
                })
              : t('description')}
          </DialogDescription>
        </DialogHeader>
        <Form {...c.form}>
          <form id={FORM_ID} noValidate onSubmit={c.onSubmit}>
            <DialogBody className="flex flex-col gap-4">
              {c.error && <Banner tone="destructive" title={c.error} isAnnounced />}
              {!c.isOauth && (
                <SignInFields
                  control={c.form.control}
                  method={c.method}
                  providerName={providerName}
                  providerKey={connection.providerKey}
                  requiresBaseUrl={false}
                  extraFields={[]}
                  isReconnect
                />
              )}
            </DialogBody>
            <DialogFooter>
              <Button variant="secondary" type="button" onClick={onClose}>
                {t('cancel')}
              </Button>
              {c.isOauth ? (
                <Button type="button" isLoading={c.isPending} onClick={c.signInAgain}>
                  {t('continueWith', { app: providerName })}
                </Button>
              ) : (
                <Button type="submit" isLoading={c.isPending}>
                  {t('submit')}
                </Button>
              )}
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
