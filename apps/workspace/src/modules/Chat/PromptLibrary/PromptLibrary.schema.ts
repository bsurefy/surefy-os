// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import {
  PROMPT_TEAMS_MAX,
  PROMPT_VARIABLE_VALUE_MAX_LENGTH,
  PROMPT_VISIBILITIES,
  promptBodySchema,
  promptTitleSchema,
} from '@surefy/contracts'

/** Create or change a prompt; the variables are read from the body when it is saved. */
export const promptFormSchema = z.object({
  title: promptTitleSchema,
  body: promptBodySchema,
  visibility: z.enum(PROMPT_VISIBILITIES),
  /** Limits a shared prompt to these teams; none means the whole organization. */
  teamIds: z.array(z.uuid()).max(PROMPT_TEAMS_MAX),
})

export type PromptFormValues = z.input<typeof promptFormSchema>

/** The value of one variable when a prompt is used. */
export const promptVariableValueSchema = z.string().trim().max(PROMPT_VARIABLE_VALUE_MAX_LENGTH)
