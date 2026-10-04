// SPDX-License-Identifier: AGPL-3.0-only
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import Field from './Field'
import FieldSet from './FieldSet'
import { Input } from '../../../primitives/input'
import { RadioGroup, RadioGroupItem } from '../../../primitives/radio-group'

describe('Field', () => {
  it('labels the control and links its help text and error', () => {
    render(
      <Field
        label="Work email"
        description="We send the invite here."
        error="Enter a work email, like name@company.com"
      >
        <Input />
      </Field>,
    )
    const input = screen.getByRole('textbox', { name: 'Work email' })
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription(
      'We send the invite here. Enter a work email, like name@company.com',
    )
  })

  it('marks the rare optional field instead of required ones', () => {
    render(
      <Field label="Nickname" optionalLabel="(optional)">
        <Input />
      </Field>,
    )
    expect(screen.getByRole('textbox', { name: 'Nickname (optional)' })).not.toHaveAttribute(
      'aria-invalid',
    )
  })

  it('names a radio group with a legend', () => {
    render(
      <FieldSet legend="Retention" error="Choose how long to keep chats">
        <RadioGroup aria-label="Retention">
          <RadioGroupItem value="30" aria-label="30 days" />
        </RadioGroup>
      </FieldSet>,
    )
    const group = screen.getByRole('group', { name: 'Retention' })
    expect(group).toHaveAccessibleDescription('Choose how long to keep chats')
  })
})
