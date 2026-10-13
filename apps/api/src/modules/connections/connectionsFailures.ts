// SPDX-License-Identifier: AGPL-3.0-only
import { CONNECTIONS_ERROR_CODES } from '@surefy/contracts'
import type { ConnectionStatusReasonCode } from '@surefy/contracts'

import {
  ConnectionBaseUrlNotAllowedError,
  ConnectionCheckFailedError,
} from './connections.errors.js'

import type { CheckOutcome } from './providers/index.js'

const REASON_MESSAGES: Record<ConnectionStatusReasonCode, string> = {
  [CONNECTIONS_ERROR_CODES.CONNECTION_TOKEN_EXPIRED]: 'The sign-in expired',
  [CONNECTIONS_ERROR_CODES.CONNECTION_REFRESH_FAILED]: 'The app refused to renew the sign-in',
  [CONNECTIONS_ERROR_CODES.CONNECTION_PROVIDER_REJECTED]: 'The app rejected the credentials',
  [CONNECTIONS_ERROR_CODES.CONNECTION_UNREACHABLE]: 'Nothing answered at the address',
}

export const reasonMessage = (reason: ConnectionStatusReasonCode): string => REASON_MESSAGES[reason]

/** A failed check becomes the error the dialog shows; nothing is stored. */
export function checkFailure(outcome: Extract<CheckOutcome, { ok: false }>): Error {
  if (outcome.unsafeAddress === true) return new ConnectionBaseUrlNotAllowedError('baseUrl')
  return new ConnectionCheckFailedError(outcome.reasonCode, reasonMessage(outcome.reasonCode))
}
