// SPDX-License-Identifier: AGPL-3.0-only
import { assertNoFindings } from './errors.js'

import type { LightMyRequestResponse } from 'fastify'

/**
 * Markers are the other organization's ids and content (names, emails, titles): values that must
 * never appear in a response to a member of this organization (testing.md, §4, step 3).
 */
export type LeakMarkers = readonly string[]

/** The markers that occur anywhere in the serialized body. */
export function findLeaks(body: unknown, markers: LeakMarkers): string[] {
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  return markers.filter((marker) => marker.length > 0 && text.includes(marker))
}

/** Fails with every leaked marker when the response body contains any of them. */
export function expectNoLeaks(response: LightMyRequestResponse, markers: LeakMarkers): void {
  assertNoFindings(
    `${response.statusCode} response`,
    findLeaks(response.body, markers).map((marker) => `body contains ${JSON.stringify(marker)}`),
  )
}
