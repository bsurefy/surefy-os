// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import {
  createOrganizationInputSchema,
  currencySchema,
  ORGANIZATION_SLUG_LENGTH,
  organizationSlugSchema,
  RESERVED_ORGANIZATION_SLUGS,
} from '../index.js'

describe('organizations schemas', () => {
  it.each(['acme', 'acme-labs', 'a1b'])('accepts the slug %s', (slug) => {
    expect(organizationSlugSchema.safeParse(slug).success).toBe(true)
  })

  it.each(['ab', '-acme', 'acme-', 'acme_labs', 'a'.repeat(ORGANIZATION_SLUG_LENGTH.max + 1)])(
    'rejects the slug %s',
    (slug) => {
      expect(organizationSlugSchema.safeParse(slug).success).toBe(false)
    },
  )

  it('lowercases slugs and currencies', () => {
    expect(organizationSlugSchema.parse(' Acme ')).toBe('acme')
    expect(currencySchema.parse('eur')).toBe('EUR')
  })

  it('keeps reserved slugs well-formed, so the service can check them by equality', () => {
    for (const slug of RESERVED_ORGANIZATION_SLUGS) {
      expect(organizationSlugSchema.safeParse(slug).success).toBe(true)
    }
  })

  it('strips unknown fields on create', () => {
    expect(createOrganizationInputSchema.parse({ name: 'Acme', slug: 'acme', plan: 'x' })).toEqual({
      name: 'Acme',
      slug: 'acme',
    })
  })
})
