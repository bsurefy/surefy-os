// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Banner } from '@surefy/ui/components/Feedback'
import { Field, MultiSelect, SwitchField } from '@surefy/ui/components/Forms'
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

import { useCreateKnowledgeBaseController } from './CreateKnowledgeBaseDialog.controller'

const FORM_ID = 'knowledge-base-form'

/** New knowledge base: name, description, "Local models only" and the teams that may search it. */
export default function CreateKnowledgeBaseDialog(
  props: Readonly<{ orgId: string; onClose: () => void }>,
) {
  const c = useCreateKnowledgeBaseController(props)
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
              <FormField
                control={c.form.control}
                name="isLocalOnly"
                render={({ field }) => (
                  <FormItem>
                    <SwitchField
                      label={t('localOnly')}
                      description={t('localOnlyHelp')}
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={c.form.control}
                name="teamIds"
                render={({ field }) => (
                  <Field
                    label={t('teams')}
                    description={t('teamsHelp')}
                    optionalLabel={t('optional')}
                  >
                    <MultiSelect
                      options={c.teamOptions}
                      value={field.value}
                      onValueChange={field.onChange}
                      labels={{
                        placeholder: t('teamsPlaceholder'),
                        search: t('teamsSearch'),
                        empty: t('teamsEmpty'),
                        remove: (label) => t('removeTeam', { label }),
                        more: (count) => t('moreTeams', { count }),
                      }}
                    />
                  </Field>
                )}
              />
            </DialogBody>
            <DialogFooter>
              <Button variant="secondary" type="button" onClick={props.onClose}>
                {t('cancel')}
              </Button>
              <Button type="submit" isLoading={c.isPending}>
                {t('submit')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
