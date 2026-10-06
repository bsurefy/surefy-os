// SPDX-License-Identifier: AGPL-3.0-only
import {
  ERROR_CODES,
  okResponse,
  ORGANIZATION_SLUG_PATTERN,
  organizationDtoSchema,
  RESERVED_ORGANIZATION_SLUGS,
  slugAvailabilityDtoSchema,
} from '@surefy/contracts'
import type {
  OrganizationDto,
  SlugAvailabilityDto,
  UpdateOrganizationInput,
} from '@surefy/contracts'
import { defineFactory } from '@surefy/web-core/testing'
import {
  defineMockDomain,
  defineMockHandler,
  mockError,
  mockOk,
} from '@surefy/web-core/testing/mock'

import { ACME_ORG } from './shell.fixtures'

const HTTP_CONFLICT = 409

/** Acme Logistics, the organization every mock domain shares. */
export const organizationFactory = defineFactory(organizationDtoSchema, (): OrganizationDto => ({
  id: ACME_ORG.id,
  name: ACME_ORG.name,
  slug: ACME_ORG.slug,
  logoUrl: null,
  timezone: 'Europe/Amsterdam',
  defaultLocale: 'en',
  currency: 'USD',
  status: 'active',
  suspendedAt: null,
  deletionRequestedAt: null,
  deletionScheduledFor: null,
  settings: {
    version: 1,
    security: { require2fa: false, sessionMaxHours: null },
    privacy: { chatSharingEnabled: true },
    setup: { skippedSteps: [] },
  },
  createdAt: '2026-01-02T09:00:00.000Z',
  updatedAt: '2026-01-02T09:00:00.000Z',
}))

let organization = organizationFactory()

/** Back to the seeded organization; tests call it between cases. */
export function resetOrganizationsMock(): void {
  organizationFactory.reset()
  organization = organizationFactory()
}

const TAKEN_SLUGS: readonly string[] = ['globex', 'initech']

function slugAvailability(rawSlug: string): SlugAvailabilityDto {
  const slug = rawSlug.trim().toLowerCase()
  if (slug === organization.slug) return { slug, available: true, reason: null }
  if (!ORGANIZATION_SLUG_PATTERN.test(slug)) return { slug, available: false, reason: 'invalid' }
  if ((RESERVED_ORGANIZATION_SLUGS as readonly string[]).includes(slug)) {
    return { slug, available: false, reason: 'reserved' }
  }
  if (TAKEN_SLUGS.includes(slug)) return { slug, available: false, reason: 'taken' }
  return { slug, available: true, reason: null }
}

function applyUpdate(input: UpdateOrganizationInput): OrganizationDto {
  const { settings, ...fields } = input
  return {
    ...organization,
    ...fields,
    settings: {
      ...organization.settings,
      security: { ...organization.settings.security, ...settings?.security },
      privacy: { ...organization.settings.privacy, ...settings?.privacy },
      setup: { ...organization.settings.setup, ...settings?.setup },
    },
    updatedAt: '2026-01-15T09:00:00.000Z',
  }
}

/**
 * The organization's settings (B2-03's routes), live on the real API (I4-02; the handlers stay for
 * component tests and for `MOCK_DOMAINS=organizations`, to look at the states). Scenarios:
 * `slug-taken` makes a save fail with `ORGANIZATION_SLUG_TAKEN`, and the built-in ones cover the
 * rest.
 */
export const organizationsDomain = defineMockDomain(
  'organizations',
  [
    defineMockHandler({
      method: 'get',
      path: '/orgs/:orgId',
      response: okResponse(organizationDtoSchema),
      scenarios: { default: () => mockOk(organization) },
    }),
    defineMockHandler({
      method: 'patch',
      path: '/orgs/:orgId',
      response: okResponse(organizationDtoSchema),
      scenarios: {
        default: async ({ request }) => {
          organization = applyUpdate((await request.json()) as UpdateOrganizationInput)
          return mockOk(organization)
        },
        'slug-taken': () =>
          mockError(HTTP_CONFLICT, ERROR_CODES.ORGANIZATION_SLUG_TAKEN, 'Slug taken'),
      },
    }),
    defineMockHandler({
      method: 'get',
      path: '/organizations/slug-availability',
      response: okResponse(slugAvailabilityDtoSchema),
      scenarios: {
        default: ({ request }) =>
          mockOk(slugAvailability(new URL(request.url).searchParams.get('slug') ?? '')),
      },
    }),
  ],
  { isLive: true },
)
