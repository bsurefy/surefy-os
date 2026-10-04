// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useForm } from 'react-hook-form'

import { ErrorSummary, SaveBar } from '@surefy/ui/components/Forms'
import { Section } from '@surefy/ui/components/Layout'
import { Button } from '@surefy/ui/primitives/button'
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

interface TeamValues {
  name: string
  email: string
}

const FORM_ID = 'showcase-team-form'

/** Blur validates a field; submit validates all and moves focus to the summary. */
export default function ValidationDemo() {
  // react-hook-form 7 mutates formState in place, so the React Compiler would keep stale errors.
  'use no memo'
  const form = useForm<TeamValues>({
    mode: 'onTouched',
    // Submit moves focus to the error summary, not to the first field.
    shouldFocusError: false,
    defaultValues: { name: 'Support', email: '' },
  })
  const { errors, submitCount, isDirty, dirtyFields, isSubmitting } = form.formState
  const fieldErrors = Object.entries(errors).flatMap(([name, error]) =>
    error.message ? [{ fieldId: `${FORM_ID}-${name}`, message: error.message }] : [],
  )
  const changes = Object.keys(dirtyFields).length

  const handleValid = async (values: TeamValues) => {
    await new Promise((resolve) => globalThis.setTimeout(resolve, 800))
    form.reset(values)
  }

  return (
    <Section title="Validation" description="Blur checks a field; submit checks all of them.">
      {submitCount > 0 && fieldErrors.length > 0 && (
        <ErrorSummary
          key={submitCount}
          title={
            fieldErrors.length === 1
              ? 'Fix 1 problem to continue'
              : `Fix ${String(fieldErrors.length)} problems to continue`
          }
          errors={fieldErrors}
        />
      )}
      <Form {...form}>
        <form
          id={FORM_ID}
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            void form.handleSubmit(handleValid)(event)
          }}
        >
          <FormField
            control={form.control}
            name="name"
            rules={{ required: 'Enter a team name, like Support' }}
            render={({ field }) => (
              <FormItem controlId={`${FORM_ID}-name`}>
                <FormLabel>Team name</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="email"
            rules={{
              required: 'Enter a contact email, like support@company.com',
              validate: (value) => {
                const [, domain = ''] = value.split('@')
                return domain.includes('.') || 'Enter an email like support@company.com'
              },
            }}
            render={({ field }) => (
              <FormItem controlId={`${FORM_ID}-email`}>
                <FormLabel>Contact email</FormLabel>
                <FormDescription>Where members send questions about this team.</FormDescription>
                <FormControl>
                  <Input type="email" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="flex justify-end">
            <Button type="submit" isLoading={isSubmitting}>
              Save team
            </Button>
          </div>
        </form>
      </Form>
      <SaveBar
        isDirty={isDirty}
        isSaving={isSubmitting}
        formId={FORM_ID}
        onDiscard={() => {
          form.reset()
        }}
        labels={{
          message: `${String(changes)} unsaved ${changes === 1 ? 'change' : 'changes'}`,
          discard: 'Discard',
          save: 'Save',
        }}
      />
    </Section>
  )
}
