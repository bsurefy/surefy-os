// SPDX-License-Identifier: AGPL-3.0-only
import { render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { ZodErrorMapProvider } from './ZodErrorMapProvider'
import validation from '../../messages/en/validation.json'

const schema = z.string().min(3)

function message(): string | undefined {
  return schema.safeParse('ab').error?.issues[0]?.message
}

describe('ZodErrorMapProvider', () => {
  it('installs the translated error map while mounted and removes it on unmount', () => {
    const before = message()
    const { unmount } = render(
      <NextIntlClientProvider locale="en" messages={{ validation }}>
        <ZodErrorMapProvider>child</ZodErrorMapProvider>
      </NextIntlClientProvider>,
    )

    expect(message()).toBe('Must be at least 3 characters.')

    unmount()
    expect(message()).toBe(before)
  })
})
