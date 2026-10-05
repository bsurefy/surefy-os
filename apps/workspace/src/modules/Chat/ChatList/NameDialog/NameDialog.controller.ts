// SPDX-License-Identifier: AGPL-3.0-only
'use no memo'

import { useTranslations } from 'next-intl'

import {
  useCreateChatFolderMutation,
  useUpdateChatFolderMutation,
  useUpdateChatMutation,
} from '@/api/chats'
import { ERROR_CODES } from '@surefy/contracts'
import type { ChatDto, ChatFolderDto } from '@surefy/contracts'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'
import { useForm } from '@surefy/web-core/forms'

import { chatNameFormSchema, folderNameFormSchema } from '../ChatList.schema'

import type { BaseSyntheticEvent } from 'react'

/** What the name dialog edits: a new folder, a folder's name or a chat's title. */
export type NameTarget =
  | { kind: 'newFolder' }
  | { kind: 'renameFolder'; folder: ChatFolderDto }
  | { kind: 'renameChat'; chat: ChatDto }

function getInitialName(target: NameTarget): string {
  if (target.kind === 'renameFolder') return target.folder.name
  if (target.kind === 'renameChat') return target.chat.title
  return ''
}

/** A taken folder name belongs on the name field; anything else is shown above the buttons. */
export function useNameDialogController({
  orgId,
  target,
  onClose,
}: {
  orgId: string
  target: NameTarget
  onClose: () => void
}) {
  const t = useTranslations(`chat.list.name.${target.kind}`)
  const tErrors = useTranslations('errors')
  const createFolder = useCreateChatFolderMutation(orgId, { silent: true })
  const updateFolder = useUpdateChatFolderMutation(orgId, { silent: true })
  const updateChat = useUpdateChatMutation(orgId, { silent: true })
  const form = useForm({
    schema: target.kind === 'renameChat' ? chatNameFormSchema : folderNameFormSchema,
    defaultValues: { name: getInitialName(target) },
  })

  const submit = form.handleSubmit(async ({ name }) => {
    try {
      if (target.kind === 'newFolder') await createFolder.mutateAsync({ name })
      else if (target.kind === 'renameFolder') {
        await updateFolder.mutateAsync({ folderId: target.folder.id, name })
      } else await updateChat.mutateAsync({ chatId: target.chat.id, title: name })
      onClose()
    } catch (error) {
      if (!isApiError(error)) throw error
      const message = getErrorMessage(error, tErrors)
      form.setError(error.code === ERROR_CODES.CHAT_FOLDER_NAME_TAKEN ? 'name' : 'root', {
        message,
      })
    }
  })

  return {
    t,
    form,
    formError: form.formState.errors.root?.message,
    isPending: form.formState.isSubmitting,
    onSubmit: (event: BaseSyntheticEvent) => {
      void submit(event)
    },
  }
}
