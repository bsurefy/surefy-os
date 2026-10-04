// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useTranslations } from 'next-intl'

import type { TeamDto } from '@surefy/contracts'
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
import { Textarea } from '@surefy/ui/primitives/textarea'

import { useTeamFormController } from './TeamFormDialog.controller'

const FORM_ID = 'team-form'

/** Create a team, or rename one and change its description. */
export default function TeamFormDialog(
  props: Readonly<{ orgId: string; team?: TeamDto; onClose: () => void }>,
) {
  const c = useTeamFormController(props)
  const t = useTranslations('settings.teams.form')

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{props.team ? t('editTitle') : t('createTitle')}</DialogTitle>
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
                {props.team ? t('save') : t('create')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
