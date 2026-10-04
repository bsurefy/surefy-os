// SPDX-License-Identifier: AGPL-3.0-only
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { useForm } from './useForm'

const schema = z.object({
  name: z.string().min(1),
  seats: z.coerce.number().int().min(1),
})

describe('useForm', () => {
  it('validates on touch and does not focus the first invalid field', () => {
    const { result } = renderHook(() => useForm({ schema, defaultValues: { name: '', seats: 1 } }))

    expect(result.current.control._options.mode).toBe('onTouched')
    expect(result.current.control._options.shouldFocusError).toBe(false)
  })

  it('lets a form override the validation mode', () => {
    const { result } = renderHook(() =>
      useForm({ schema, mode: 'onChange', defaultValues: { name: '', seats: 1 } }),
    )

    expect(result.current.control._options.mode).toBe('onChange')
  })

  it('gives the submit handler the parsed output of the schema', async () => {
    const onValid = vi.fn()
    const { result } = renderHook(() =>
      useForm({ schema, defaultValues: { name: 'Support', seats: '12' } }),
    )

    await act(() => result.current.handleSubmit(onValid)())

    expect(onValid).toHaveBeenCalledWith({ name: 'Support', seats: 12 }, undefined)
    onValid.mock.calls[0]?.[0] satisfies z.output<typeof schema> | undefined
  })

  it('reports schema errors on their fields instead of submitting', async () => {
    const onValid = vi.fn()
    // React Hook Form 7 re-renders for the `formState` keys read during render.
    const { result } = renderHook(() => {
      const form = useForm({ schema, defaultValues: { name: '', seats: 0 } })
      return { form, errors: form.formState.errors }
    })

    await act(() => result.current.form.handleSubmit(onValid)())

    expect(onValid).not.toHaveBeenCalled()
    expect(result.current.errors.name?.message).toMatch(/\S/)
    expect(result.current.errors.seats?.message).toMatch(/\S/)
  })
})
