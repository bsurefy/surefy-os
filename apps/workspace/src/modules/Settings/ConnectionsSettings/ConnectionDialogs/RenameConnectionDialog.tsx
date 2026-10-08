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
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@surefy/ui/primitives/form'
import { Input } from '@surefy/ui/primitives/input'

import { useRenameConnectionController } from './RenameConnectionDialog.controller'

const FORM_ID = 'rename-connection-form'

/** Rename a connection; custom APIs and MCP servers can also change their address. */
export default function RenameConnectionDialog(
  props: Readonly<{ orgId: string; connection: ConnectionDto; onClose: () => void }>,
) {
  const c = useRenameConnectionController(props)
  const { t } = c

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{c.hasAddress ? t('titleWithAddress') : t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <Form {...c.form}>
          <form id={FORM_ID} noValidate onSubmit={c.onSubmit}>
            <DialogBody className="flex flex-col gap-4">
              {c.formError && <Banner tone="destructive" title={c.formError} isAnnounced />}
              <FormField
                control={c.form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('name')}</FormLabel>
                    <FormControl>
                      <Input autoComplete="off" autoFocus {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {c.hasAddress && (
                <FormField
                  control={c.form.control}
                  name="baseUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('baseUrl')}</FormLabel>
                      <FormControl>
                        <Input autoComplete="off" placeholder="https://" {...field} />
                      </FormControl>
                      <FormDescription>{t('baseUrlHelp')}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </DialogBody>
            <DialogFooter>
              <Button variant="secondary" type="button" onClick={props.onClose}>
                {t('cancel')}
              </Button>
              <Button type="submit" isLoading={c.isPending}>
                {t('save')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
