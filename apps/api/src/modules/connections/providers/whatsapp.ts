// SPDX-License-Identifier: AGPL-3.0-only
import { CONNECTIONS_ERROR_CODES } from '@surefy/contracts'

import { asString, bearer, checkCall, checkRequest, jsonObject } from './providerHttp.js'

import type { ProviderAdapter } from './provider.types.js'

// WhatsApp Business (channel): a permanent access token of the business app and the phone number
// ID it sends from. The check reads the phone number, which names the account.

const GRAPH_URL = 'https://graph.facebook.com/v21.0'
const PHONE_NUMBER_ID = /^\d{5,30}$/

export const whatsapp: ProviderAdapter = {
  key: 'whatsapp',
  check: (http, { secret }) => {
    const phoneNumberId = secret.extra?.phoneNumberId ?? ''
    if (!PHONE_NUMBER_ID.test(phoneNumberId)) {
      return Promise.resolve({
        ok: false,
        reasonCode: CONNECTIONS_ERROR_CODES.CONNECTION_PROVIDER_REJECTED,
        latencyMs: null,
      })
    }
    return checkCall(
      () =>
        http.provider(
          `${GRAPH_URL}/${phoneNumberId}?fields=display_phone_number,verified_name`,
          checkRequest({ authorization: bearer(secret.token ?? '') }),
        ),
      (result) => {
        if (result.status >= 400) {
          return {
            ok: false,
            reasonCode: CONNECTIONS_ERROR_CODES.CONNECTION_PROVIDER_REJECTED,
            latencyMs: result.latencyMs,
          }
        }
        const body = jsonObject(result)
        const number = asString(body.display_phone_number)
        const name = asString(body.verified_name)
        return {
          ok: true,
          latencyMs: result.latencyMs,
          account: {
            id: phoneNumberId,
            label: name !== null && number !== null ? `${name} (${number})` : (number ?? name),
          },
        }
      },
    )
  },
}
