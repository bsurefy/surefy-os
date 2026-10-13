// SPDX-License-Identifier: AGPL-3.0-only
import { notFound } from 'next/navigation'

/**
 * Not released. S6-12 replaces this body with the run detail behind the access check, and the module's
 * navigation keeps this page unlinked until then.
 */
export default function RunPage(): never {
  notFound()
}
