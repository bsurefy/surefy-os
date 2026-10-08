// SPDX-License-Identifier: AGPL-3.0-only
import { useTranslations } from 'next-intl'

import { AGENT_CONVERSATION_STARTERS_MAX, AGENT_INSTRUCTIONS_MAX_LENGTH } from '@surefy/contracts'

import type { InstructionsTabProps } from './InstructionsTab.types'

/** Instructions: the fields write into the working copy; autosave does the rest. */
export function useInstructionsTabController({
  definition,
  meta,
  isNameValid,
  onDefinitionChange,
  onMetaChange,
}: InstructionsTabProps) {
  const t = useTranslations('agents.editor.instructions')
  const starters = definition.conversationStarters

  return {
    t,
    name: meta.name,
    description: meta.description,
    nameError: isNameValid ? undefined : t('name.required'),
    instructions: definition.instructions,
    instructionsMaxLength: AGENT_INSTRUCTIONS_MAX_LENGTH,
    tone: definition.tone ?? '',
    starters,
    canAddStarter: starters.length < AGENT_CONVERSATION_STARTERS_MAX,
    previewStarters: starters.map((starter) => starter.trim()).filter((starter) => starter !== ''),
    onNameChange: (name: string) => {
      onMetaChange({ name })
    },
    onDescriptionChange: (description: string) => {
      onMetaChange({ description })
    },
    onInstructionsChange: (instructions: string) => {
      onDefinitionChange((current) => ({ ...current, instructions }))
    },
    onToneChange: (tone: string) => {
      onDefinitionChange((current) => ({ ...current, tone }))
    },
    onStarterChange: (index: number, value: string) => {
      onDefinitionChange((current) => ({
        ...current,
        conversationStarters: current.conversationStarters.map((starter, at) =>
          at === index ? value : starter,
        ),
      }))
    },
    onAddStarter: () => {
      onDefinitionChange((current) => ({
        ...current,
        conversationStarters: [...current.conversationStarters, ''],
      }))
    },
    onRemoveStarter: (index: number) => {
      onDefinitionChange((current) => ({
        ...current,
        conversationStarters: current.conversationStarters.filter((_, at) => at !== index),
      }))
    },
  }
}
