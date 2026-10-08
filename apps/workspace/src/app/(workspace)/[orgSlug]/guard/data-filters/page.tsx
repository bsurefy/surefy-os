// SPDX-License-Identifier: AGPL-3.0-only
import { notFound } from 'next/navigation'

/**
 * Not released. S6-07 replaces this body with DataFilters behind the access check, and the module's
 * navigation keeps this page unlinked until then.
 */
export default function DataFiltersPage(): never {
  notFound()
}
