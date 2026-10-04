// SPDX-License-Identifier: AGPL-3.0-only
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { ERROR_CODES } from '@surefy/contracts'

import { applyApiErrorToForm } from './applyApiErrorToForm'
import { useForm } from './useForm'
import { ApiError } from '../http/ApiError'

import type { ErrorsTranslator } from '../errors/errors.types'

const MESSAGES: Record<string, string> = {
  [ERROR_CODES.TEAM_NAME_TAKEN]: 'A team with this name already exists.',
  fallback: 'Something went wrong.',
}
const tErrors = ((key: string) => MESSAGES[key] ?? key) as ErrorsTranslator
tErrors.has = (key) => key in MESSAGES

const schema = z.object({ name: z.string(), members: z.array(z.object({ email: z.string() })) })

// React Hook Form 7 re-renders for the `formState` keys read during render, so `errors` is read here.
function renderForm() {
  return renderHook(() => {
    const form = useForm({
      schema,
      defaultValues: { name: '', members: [{ email: '' }, { email: '' }] },
    })
    return { form, errors: form.formState.errors }
  })
}

describe('applyApiErrorToForm', () => {
  it('puts VALIDATION_FAILED details on their fields as validation keys', () => {
    const { result } = renderForm()
    const error = new ApiError(422, ERROR_CODES.VALIDATION_FAILED, 'Validation failed', [
      { path: 'name', code: 'too_small', message: 'String must contain at least 1 character' },
      { path: 'members.1.email', code: 'invalid_format', message: 'Invalid email' },
    ])

    act(() => {
      applyApiErrorToForm(error, result.current.form, tErrors)
    })

    expect(result.current.errors.name?.message).toBe('issues.too_small')
    expect(result.current.errors.members?.[1]?.email?.message).toBe('issues.invalid_format')
    expect(result.current.errors.root).toBeUndefined()
  })

  it('puts any other code on root, translated', () => {
    const { result } = renderForm()

    act(() => {
      applyApiErrorToForm(
        new ApiError(409, ERROR_CODES.TEAM_NAME_TAKEN, 'Taken'),
        result.current.form,
        tErrors,
      )
    })

    expect(result.current.errors.root?.message).toBe('A team with this name already exists.')
    expect(result.current.errors.name).toBeUndefined()
  })

  it('treats VALIDATION_FAILED without details as a root error', () => {
    const { result } = renderForm()

    act(() => {
      applyApiErrorToForm(
        new ApiError(422, ERROR_CODES.VALIDATION_FAILED, 'Validation failed'),
        result.current.form,
        tErrors,
      )
    })

    expect(result.current.errors.root?.message).toBe('Something went wrong.')
  })

  it('rethrows anything that is not an ApiError', () => {
    const { result } = renderForm()
    const crash = new Error('render crash')

    expect(() => {
      applyApiErrorToForm(crash, result.current.form, tErrors)
    }).toThrow(crash)
  })
})
