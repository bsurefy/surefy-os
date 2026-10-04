// SPDX-License-Identifier: AGPL-3.0-only
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import NumberInput from './NumberInput'
import { parseNumber } from './parseNumber'

function Seats({ initial = 1200 }: Readonly<{ initial?: number | null }>) {
  const [value, setValue] = useState<number | null>(initial)
  return (
    <>
      <NumberInput
        aria-label="Seats"
        locale="en-US"
        value={value}
        onValueChange={setValue}
        min={0}
        max={5000}
        suffix="seats"
        stepper={{ decrementLabel: 'Decrease', incrementLabel: 'Increase' }}
      />
      <output>{String(value)}</output>
    </>
  )
}

describe('NumberInput', () => {
  it('shows the formatted value and edits the plain one', async () => {
    render(<Seats />)
    const input = screen.getByRole('textbox', { name: 'Seats' })
    expect(input).toHaveValue('1,200')
    await userEvent.click(input)
    expect(input).toHaveValue('1200')
    await userEvent.clear(input)
    await userEvent.type(input, '2500.5')
    await userEvent.tab()
    expect(input).toHaveValue('2,500.5')
    expect(screen.getByRole('status')).toHaveTextContent('2500.5')
  })

  it('keeps the value inside min and max', async () => {
    render(<Seats />)
    const input = screen.getByRole('textbox', { name: 'Seats' })
    await userEvent.clear(input)
    await userEvent.type(input, '9000')
    await userEvent.tab()
    expect(input).toHaveValue('5,000')
    expect(screen.getByRole('button', { name: 'Increase' })).toBeDisabled()
  })

  it('steps with the arrow keys and keeps the last value on junk', async () => {
    render(<Seats initial={10} />)
    const input = screen.getByRole('textbox', { name: 'Seats' })
    await userEvent.click(input)
    await userEvent.keyboard('{ArrowUp}{ArrowUp}{ArrowDown}')
    expect(input).toHaveValue('11')
    await userEvent.clear(input)
    await userEvent.type(input, 'abc')
    await userEvent.tab()
    expect(input).toHaveValue('11')
  })

  it('reads numbers typed in the locale format', () => {
    expect(parseNumber('1.234,5', 'de-DE')).toBe(1234.5)
    expect(parseNumber('1,234.5', 'en-US')).toBe(1234.5)
    expect(parseNumber('', 'en-US')).toBeNull()
    expect(parseNumber('1.2.3', 'en-US')).toBeNaN()
  })
})
