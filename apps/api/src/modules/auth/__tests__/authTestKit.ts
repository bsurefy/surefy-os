// SPDX-License-Identifier: AGPL-3.0-only
import { createHmac } from 'node:crypto'

import { QUEUES } from '@/constants/queues.js'

import { TEST_APP_ORIGIN } from '../../../../test/helpers/auth.js'

import type { Container } from '@/container.js'
import type { SendEmailPayload } from '@/modules/notifications/index.js'
import type { FastifyInstance, LightMyRequestResponse } from 'fastify'

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

const base32Decode = (input: string): Buffer => {
  let bits = ''
  for (const char of input.replaceAll('=', '').toUpperCase()) {
    const value = BASE32.indexOf(char)
    if (value < 0) throw new Error('invalid base32')
    bits += value.toString(2).padStart(5, '0')
  }
  const bytes: number[] = []
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(Number.parseInt(bits.slice(i, i + 8), 2))
  return Buffer.from(bytes)
}

/** RFC 6238 TOTP (SHA-1, 6 digits, 30 s), as an authenticator app computes it. */
export function totp(secret: string, at = Date.now()): string {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)))
  const hmac = createHmac('sha1', base32Decode(secret)).update(counter).digest()
  const offset = (hmac.at(-1) ?? 0) & 0x0f
  const code = (hmac.readUInt32BE(offset) & 0x7f_ff_ff_ff) % 1_000_000
  return code.toString().padStart(6, '0')
}

/** The `secret` of an `otpauth://` URI. */
export const secretOf = (uri: string): string => {
  const secret = new URL(uri).searchParams.get('secret')
  if (secret === null) throw new Error('no secret in the TOTP URI')
  return secret
}

/** A POST to Better Auth through the workspace's host, as the browser makes it. */
export const authPost = (
  app: FastifyInstance,
  path: string,
  payload: unknown,
  headers: Record<string, string> = {},
): Promise<LightMyRequestResponse> =>
  app.inject({
    method: 'POST',
    url: `/api/auth${path}`,
    headers: { host: new URL(TEST_APP_ORIGIN).host, origin: TEST_APP_ORIGIN, ...headers },
    payload: payload as Record<string, unknown>,
  })

/** Every job payload waiting on the `email` queue. */
export async function queuedEmails(container: Container): Promise<SendEmailPayload[]> {
  const jobs = await container.queues.get(QUEUES.EMAIL).getJobs(['waiting', 'delayed'])
  return jobs.map((job) => job.data as SendEmailPayload)
}
