// SPDX-License-Identifier: AGPL-3.0-only
import { notFound } from 'next/navigation'

/**
 * Not released. S6-12 replaces this body with Runs behind the access check, and the module's
 * navigation keeps this page unlinked until then.
 */
export default function RunsPage(): never {
  notFound()
}
