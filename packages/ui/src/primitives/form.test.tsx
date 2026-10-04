// SPDX-License-Identifier: AGPL-3.0-only
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm } from 'react-hook-form'
import { describe, expect, it, vi } from 'vitest'

import { Button } from './button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from './form'
import { Input } from './input'

function InviteForm() {
  const onValid = vi.fn()
  const form = useForm({ defaultValues: { email: '' } })
  return (
    <Form {...form}>
      <form
        noValidate
        onSubmit={(event) => {
          void form.handleSubmit(onValid)(event)
        }}
      >
        <FormField
          control={form.control}
          name="email"
          rules={{ required: 'Enter a work email, like name@company.com' }}
          render={({ field }) => (
            <FormItem controlId="invite-email">
              <FormLabel>Work email</FormLabel>
              <FormDescription>We send the invite here.</FormDescription>
              <FormControl>
                <Input type="email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit">Invite</Button>
      </form>
    </Form>
  )
}

describe('Form', () => {
  it('shows the field error below the field and links it', async () => {
    render(<InviteForm />)
    await userEvent.click(screen.getByRole('button', { name: 'Invite' }))
    const input = screen.getByRole('textbox', { name: 'Work email' })
    // A fixed control id (for the error summary links) keeps the label working.
    expect(input).toHaveAttribute('id', 'invite-email')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription(
      'We send the invite here. Enter a work email, like name@company.com',
    )
  })
})
