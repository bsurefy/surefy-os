// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { APPROVAL_RISKS, APPROVAL_TIMEOUT_ACTIONS } from '@surefy/contracts'
import { MultiSelect, NumberInput, SelectInput, SwitchField } from '@surefy/ui/components/Forms'
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

import { WAIT_UNITS } from '../GuardTab.constants'
import { useApprovalRuleDialogController } from './ApprovalRuleDialog.controller'

import type { ApprovalRuleDialogProps } from './ApprovalRuleDialog.types'

const FORM_ID = 'agent-approval-rule-form'

/**
 * An approval rule of this agent: which action needs a person, who decides, how long to wait and
 * what happens when nobody answers in time.
 */
export default function ApprovalRuleDialog(props: Readonly<ApprovalRuleDialogProps>) {
  const c = useApprovalRuleDialogController(props)
  const { t, form } = c
  const pickerLabels = {
    placeholder: t('approvers.placeholder'),
    search: t('approvers.search'),
    empty: t('approvers.empty'),
    loading: t('approvers.loading'),
    remove: (label: string) => t('approvers.remove', { name: label }),
    more: (count: number) => t('approvers.more', { count }),
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{props.rule ? t('editTitle') : t('newTitle')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form id={FORM_ID} noValidate onSubmit={c.onSubmit}>
            <DialogBody className="flex flex-col gap-4">
              <FormField
                control={form.control}
                name="action"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('action.label')}</FormLabel>
                    <FormControl>
                      <Input autoComplete="off" autoFocus {...field} />
                    </FormControl>
                    <FormDescription>{t('action.help')}</FormDescription>
                    {props.toolNames.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {props.toolNames.map((name) => (
                          <Button
                            key={name}
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              field.onChange(name)
                            }}
                          >
                            {name}
                          </Button>
                        ))}
                      </div>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="approvers"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('approvers.label')}</FormLabel>
                    <MultiSelect
                      options={c.approverOptions}
                      labels={pickerLabels}
                      value={field.value}
                      onValueChange={field.onChange}
                      isLoading={c.isLoadingApprovers}
                      aria-label={t('approvers.label')}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="waits"
                render={({ field }) => (
                  <FormItem>
                    <SwitchField
                      label={t('wait.label')}
                      description={t('wait.help')}
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormItem>
                )}
              />
              {c.waits && (
                <>
                  <div className="flex items-start gap-2">
                    <FormField
                      control={form.control}
                      name="waitAmount"
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormLabel>{t('wait.amount')}</FormLabel>
                          <NumberInput
                            aria-label={t('wait.amount')}
                            value={field.value}
                            onValueChange={field.onChange}
                            min={1}
                          />
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="waitUnit"
                      render={({ field }) => (
                        <FormItem className="w-36">
                          <FormLabel>{t('wait.unit')}</FormLabel>
                          <SelectInput
                            aria-label={t('wait.unit')}
                            options={WAIT_UNITS.map((unit) => ({
                              value: unit,
                              label: t(`units.${unit}`),
                            }))}
                            value={field.value}
                            onValueChange={field.onChange}
                          />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="onTimeout"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('timeout.label')}</FormLabel>
                        <SelectInput
                          aria-label={t('timeout.label')}
                          options={APPROVAL_TIMEOUT_ACTIONS.map((action) => ({
                            value: action,
                            label: t(`timeout.${action}`),
                          }))}
                          value={field.value}
                          onValueChange={field.onChange}
                        />
                      </FormItem>
                    )}
                  />
                  {c.isEscalating && (
                    <FormField
                      control={form.control}
                      name="escalateTo"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('escalate.label')}</FormLabel>
                          <MultiSelect
                            options={c.approverOptions}
                            labels={pickerLabels}
                            value={field.value}
                            onValueChange={field.onChange}
                            isLoading={c.isLoadingApprovers}
                            aria-label={t('escalate.label')}
                          />
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </>
              )}
              <FormField
                control={form.control}
                name="risk"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('risk.label')}</FormLabel>
                    <SelectInput
                      aria-label={t('risk.label')}
                      options={APPROVAL_RISKS.map((risk) => ({
                        value: risk,
                        label: t(`risk.${risk}`),
                      }))}
                      value={field.value}
                      onValueChange={field.onChange}
                    />
                    <FormDescription>{t('risk.help')}</FormDescription>
                  </FormItem>
                )}
              />
            </DialogBody>
            <DialogFooter>
              <Button variant="secondary" type="button" onClick={props.onClose}>
                {t('cancel')}
              </Button>
              <Button type="submit">{t('save')}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
