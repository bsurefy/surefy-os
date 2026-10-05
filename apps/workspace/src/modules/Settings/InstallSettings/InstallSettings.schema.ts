// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import {
  emailSchema,
  INSTALL_ORG_CREATION_POLICIES,
  INSTALL_SIGNUP_POLICIES,
} from '@surefy/contracts'

const isValidUrlOrEmpty = (value: string) => {
  if (value === '') return true
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

/** Sign-in methods, sign-up, organization creation and web search: one form, one save bar. */
export const installFormSchema = z.object({
  emailPassword: z.boolean(),
  google: z.boolean(),
  microsoft: z.boolean(),
  github: z.boolean(),
  signupPolicy: z.enum(INSTALL_SIGNUP_POLICIES),
  orgCreationPolicy: z.enum(INSTALL_ORG_CREATION_POLICIES),
  searxngUrl: z.string().trim().refine(isValidUrlOrEmpty, { message: 'invalidUrl' }),
})
export type InstallFormValues = z.input<typeof installFormSchema>

const isPort = (value: string) =>
  /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 65_535

/** The mail server; the password is optional because an empty one keeps the stored one. */
export const smtpFormSchema = z.object({
  host: z.string().trim().min(1).max(253),
  port: z.string().trim().refine(isPort, { message: 'invalidValue' }),
  secure: z.boolean(),
  username: z.string().trim().max(254),
  password: z.string().max(512),
  fromAddress: emailSchema,
  fromName: z.string().trim().max(120),
})
export type SmtpFormValues = z.input<typeof smtpFormSchema>

export const testEmailSchema = z.object({ to: emailSchema })
export type TestEmailValues = z.input<typeof testEmailSchema>
