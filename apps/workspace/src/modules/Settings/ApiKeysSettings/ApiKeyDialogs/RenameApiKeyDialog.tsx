// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useTranslations } from 'next-intl'

import type { ApiKeyDto } from '@surefy/contracts'
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@surefy/ui/primitives/form'
import { Input } from '@surefy/ui/primitives/input'

import { useRenameApiKeyController } from './RenameApiKeyDialog.controller'

const FORM_ID = 'rename-api-key-form'

/** Rename a key: the label only; permissions and expiry are fixed when it is created. */
export default function RenameApiKeyDialog(
  props: Readonly<{ orgId: string; apiKey: ApiKeyDto; onClose: () => void }>,
) {
  const c = useRenameApiKeyController(props)
  const t = useTranslations('settings.apiKeys.rename')

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
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
