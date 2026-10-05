// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { chatFolderNameSchema, chatTitleSchema } from '@surefy/contracts'

/** Rename a chat. */
export const chatNameFormSchema = z.object({ name: chatTitleSchema })

/** Create or rename a folder. */
export const folderNameFormSchema = z.object({ name: chatFolderNameSchema })

export type NameFormValues = z.input<typeof folderNameFormSchema>
