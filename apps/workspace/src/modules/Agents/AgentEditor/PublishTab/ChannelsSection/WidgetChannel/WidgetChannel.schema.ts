// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { WIDGET_ORIGINS_MAX, WIDGET_POSITIONS, WIDGET_THEMES } from '@surefy/contracts'
import type { WidgetChannelConfig } from '@surefy/contracts'

import { parseOrigins } from '../ChannelsSection.utils'

const GREETING_MAX = 300

/** What the form says when a value is not acceptable; translated by the caller. */
export interface WidgetFormMessages {
  originsRequired: string
  originsInvalid: (addresses: string) => string
  originsTooMany: string
  greeting: string
}

/** The widget form: the websites it may load on, one per line, and how it looks. */
export function createWidgetFormSchema(messages: WidgetFormMessages) {
  return z.object({
    origins: z.string().superRefine((text, ctx) => {
      const { origins, invalid } = parseOrigins(text)
      if (invalid.length > 0) {
        ctx.addIssue({ code: 'custom', message: messages.originsInvalid(invalid.join(', ')) })
      } else if (origins.length === 0) {
        ctx.addIssue({ code: 'custom', message: messages.originsRequired })
      } else if (origins.length > WIDGET_ORIGINS_MAX) {
        ctx.addIssue({ code: 'custom', message: messages.originsTooMany })
      }
    }),
    greeting: z.string().trim().max(GREETING_MAX, messages.greeting),
    theme: z.enum(WIDGET_THEMES),
    position: z.enum(WIDGET_POSITIONS),
  })
}

export type WidgetFormValues = z.infer<ReturnType<typeof createWidgetFormSchema>>

export function widgetToValues(config: WidgetChannelConfig | undefined): WidgetFormValues {
  return {
    origins: config?.allowedOrigins.join('\n') ?? '',
    greeting: config?.greeting ?? '',
    theme: config?.theme ?? 'auto',
    position: config?.position ?? 'bottom_right',
  }
}

export function toWidgetConfig(values: WidgetFormValues): WidgetChannelConfig {
  return {
    allowedOrigins: parseOrigins(values.origins).origins,
    greeting: values.greeting.trim(),
    theme: values.theme,
    position: values.position,
  }
}
