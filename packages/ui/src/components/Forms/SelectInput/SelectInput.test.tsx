// SPDX-License-Identifier: AGPL-3.0-only
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import Field from '../Field'
import SelectInput from './SelectInput'

describe('SelectInput', () => {
  it('is labelled and described by its Field', () => {
    render(
      <Field label="Default language" description="For new members." error="Choose a language">
        <SelectInput
          options={[
            { value: 'en', label: 'English' },
            { value: 'de', label: 'Deutsch' },
          ]}
          value={undefined}
          onValueChange={vi.fn()}
          placeholder="Select a language"
        />
      </Field>,
    )
    const trigger = screen.getByRole('combobox', { name: 'Default language' })
    expect(trigger).toHaveTextContent('Select a language')
    expect(trigger).toHaveAttribute('aria-invalid', 'true')
    expect(trigger).toHaveAccessibleDescription('For new members. Choose a language')
  })
})
