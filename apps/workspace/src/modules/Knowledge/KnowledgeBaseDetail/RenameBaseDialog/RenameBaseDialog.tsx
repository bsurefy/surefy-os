// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import type { KnowledgeBaseDto } from '@surefy/contracts'
import { Banner } from '@surefy/ui/components/Feedback'
import { Button } from '@surefy/ui/primitives/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
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
import { Textarea } from '@surefy/ui/primitives/textarea'

import { useRenameBaseController } from './RenameBaseDialog.controller'

/** Rename a knowledge base and change its description. */
export default function RenameBaseDialog(
  props: Readonly<{ orgId: string; base: KnowledgeBaseDto; onClose: () => void }>,
) {
  const c = useRenameBaseController(props)
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
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>
        <Form {...c.form}>
          <form noValidate onSubmit={c.onSubmit}>
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
              <FormField
                control={c.form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t('descriptionLabel')}{' '}
                      <span className="text-muted-foreground">({t('optional')})</span>
                    </FormLabel>
                    <FormControl>
                      <Textarea rows={3} {...field} />
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
