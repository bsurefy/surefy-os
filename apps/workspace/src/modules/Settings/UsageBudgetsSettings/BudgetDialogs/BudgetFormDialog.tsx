// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import type { BudgetDto, BudgetScope } from '@surefy/contracts'
import { Banner } from '@surefy/ui/components/Feedback'
import { Combobox, NumberInput, SwitchField } from '@surefy/ui/components/Forms'
import { ConfirmDialog } from '@surefy/ui/components/Overlay'
import { Button } from '@surefy/ui/primitives/button'
import { Checkbox } from '@surefy/ui/primitives/checkbox'
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
import { Label } from '@surefy/ui/primitives/label'
import { RadioGroup, RadioGroupItem } from '@surefy/ui/primitives/radio-group'

import { bpToPercent } from '../UsageBudgetsSettings.utils'
import { useBudgetFormController } from './BudgetFormDialog.controller'

const FORM_ID = 'budget-form'

/**
 * Create or change a budget: who it is for (a new team budget or personal limit), the monthly
 * amount, what happens when it is reached and the alerts at 50, 80 and 100 percent.
 */
export default function BudgetFormDialog(
  props: Readonly<{
    orgId: string
    scope: BudgetScope
    budget: BudgetDto | null
    organizationBudget: BudgetDto | null
    currency: string | null
    onClose: () => void
  }>,
) {
  const c = useBudgetFormController(props)
  const { t } = c

  if (c.confirm) {
    return (
      <ConfirmDialog
        open
        onOpenChange={(open) => {
          if (!open) c.confirm?.onCancel()
        }}
        tier="T2"
        title={c.confirm.title}
        description={c.confirm.description}
        labels={{ confirm: t('lower.confirm') }}
        onConfirm={c.confirm.onConfirm}
      />
    )
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
          <DialogTitle>{c.title}</DialogTitle>
          <DialogDescription>{t(`form.description.${props.scope}`)}</DialogDescription>
        </DialogHeader>
        <Form {...c.form}>
          <form id={FORM_ID} noValidate onSubmit={c.onSubmit}>
            <DialogBody className="flex flex-col gap-5">
              {c.formError && <Banner tone="destructive" title={c.formError} isAnnounced />}
              {c.pickTeam && (
                <FormField
                  control={c.form.control}
                  name="targetId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('form.team')}</FormLabel>
                      <FormControl>
                        <Combobox
                          options={c.teamOptions}
                          value={field.value || null}
                          onValueChange={(value) => {
                            field.onChange(value ?? '')
                          }}
                          isLoading={c.isLoadingTeams}
                          labels={{
                            placeholder: t('form.teamPlaceholder'),
                            search: t('form.teamSearch'),
                            empty: t('form.teamEmpty'),
                            loading: t('form.loading'),
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              {c.pickPerson && (
                <FormField
                  control={c.form.control}
                  name="targetId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('form.person')}</FormLabel>
                      <FormControl>
                        <Combobox
                          options={c.personOptions}
                          value={field.value || null}
                          onValueChange={(value) => {
                            field.onChange(value ?? '')
                          }}
                          onSearchChange={c.onPersonSearch}
                          isLoading={c.isLoadingPeople}
                          labels={{
                            placeholder: t('form.personPlaceholder'),
                            search: t('form.personSearch'),
                            empty: t('form.personEmpty'),
                            loading: t('form.loading'),
                          }}
                        />
                      </FormControl>
                      <FormDescription>{t('form.personHelp')}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <FormField
                control={c.form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('form.amount')}</FormLabel>
                    <FormControl>
                      <NumberInput
                        value={field.value}
                        onValueChange={field.onChange}
                        onBlur={field.onBlur}
                        min={0}
                        prefix={c.currencySymbol}
                        formatOptions={{ maximumFractionDigits: 2 }}
                        autoFocus={!c.pickTeam && !c.pickPerson}
                      />
                    </FormControl>
                    <FormDescription>{c.parentHint ?? t('form.amountHelp')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={c.form.control}
                name="onReached"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('form.onReached')}</FormLabel>
                    <RadioGroup
                      value={field.value}
                      onValueChange={field.onChange}
                      aria-label={t('form.onReached')}
                    >
                      {c.onReachedOptions.map((option) => (
                        <div key={option.value} className="flex items-start gap-2">
                          <RadioGroupItem
                            id={`budget-on-reached-${option.value}`}
                            value={option.value}
                            className="mt-0.5"
                          />
                          <Label
                            htmlFor={`budget-on-reached-${option.value}`}
                            className="flex flex-col items-start gap-0.5 text-left"
                          >
                            <span className="font-medium">{option.label}</span>
                            <span className="text-caption text-muted-foreground font-normal">
                              {option.description}
                            </span>
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={c.form.control}
                name="alertThresholdsBp"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('form.alerts')}</FormLabel>
                    <div className="flex flex-wrap gap-4">
                      {c.alertChoices.map((bp) => (
                        <div key={bp} className="flex items-center gap-2">
                          <Checkbox
                            id={`budget-alert-${String(bp)}`}
                            checked={field.value.includes(bp)}
                            onCheckedChange={(checked) => {
                              field.onChange(
                                checked === true
                                  ? [...field.value, bp].sort((a, b) => a - b)
                                  : field.value.filter((item) => item !== bp),
                              )
                            }}
                          />
                          <Label htmlFor={`budget-alert-${String(bp)}`}>
                            {t('form.alertAt', { percent: bpToPercent(bp) })}
                          </Label>
                        </div>
                      ))}
                    </div>
                    <FormDescription>{t(`form.alertsHelp.${props.scope}`)}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {!c.isCreate && (
                <FormField
                  control={c.form.control}
                  name="isEnabled"
                  render={({ field }) => (
                    <SwitchField
                      label={t('form.enabled')}
                      description={t('form.enabledHelp')}
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  )}
                />
              )}
            </DialogBody>
            <DialogFooter>
              <Button variant="secondary" type="button" onClick={props.onClose}>
                {t('form.cancel')}
              </Button>
              <Button type="submit" isLoading={c.isSaving}>
                {c.isCreate ? t('form.create') : t('form.save')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
