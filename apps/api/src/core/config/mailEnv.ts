// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

const mailFrom = z.string().min(3).default('SurefyOS <no-reply@localhost>')

/** Development: the mail integration logs the email instead of sending it. */
export const consoleMailEnvSchema = z.object({
  MAIL_DRIVER: z.literal('console'),
  MAIL_FROM: mailFrom,
})

/** Any SMTP server through Nodemailer. */
export const smtpMailEnvSchema = z.object({
  MAIL_DRIVER: z.literal('smtp'),
  MAIL_FROM: mailFrom,
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(587),
  SMTP_SECURE: z.stringbool().default(false), // implicit TLS (port 465); STARTTLS is negotiated otherwise
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
})

/** Variables of the selected driver only (discriminated on MAIL_DRIVER). */
export const mailEnvSchema = z.discriminatedUnion('MAIL_DRIVER', [
  consoleMailEnvSchema,
  smtpMailEnvSchema,
])
export type MailEnv = z.infer<typeof mailEnvSchema>
