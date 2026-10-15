// SPDX-License-Identifier: AGPL-3.0-only
'use no memo'

import { useState } from 'react'

import type { UsableModelDto } from '@surefy/contracts'
import { useEffectiveAccess } from '@surefy/web-core/access'

import { isLocalModel } from './ThreadView.settings'

/**
 * The composer's two switches for the next messages: web search (when the person's team may search
 * the web; an agent answers with its own tools) and Compare (answer B from another model; a
 * private chat compares local models only).
 */
export function useComposerTools({
  models,
  modelKey,
  isPrivate,
  isAgentChat,
}: {
  models: readonly UsableModelDto[]
  /** The chat's own model: it gives answer A. */
  modelKey: string | null
  isPrivate: boolean
  isAgentChat: boolean
}) {
  const access = useEffectiveAccess().data
  const [isWebSearchOn, setIsWebSearchOn] = useState(false)
  const [isCompareOn, setIsCompareOn] = useState(false)
  const [compareChoice, setCompareChoice] = useState<string | null>(null)

  const canSearchWeb = access?.tools.webSearch === true && !isAgentChat
  const options = models.filter(
    (model) => model.modelKey !== modelKey && (!isPrivate || isLocalModel(model)),
  )
  const canCompare = !isAgentChat && options.length > 0
  const model = options.find((candidate) => candidate.modelKey === compareChoice) ?? options[0]

  return {
    isSearchingWeb: canSearchWeb && isWebSearchOn,
    /** Answer B's model while Compare is on; null sends a plain message. */
    compareModelKey: isCompareOn && canCompare ? (model?.modelKey ?? null) : null,
    webSearch: {
      isAvailable: canSearchWeb,
      isOn: canSearchWeb && isWebSearchOn,
      onToggle: () => {
        setIsWebSearchOn((value) => !value)
      },
    },
    compare: {
      isAvailable: canCompare,
      isOn: isCompareOn && canCompare,
      model,
      options,
      onToggle: setIsCompareOn,
      onModelChange: (key: string) => {
        setCompareChoice(key)
        setIsCompareOn(true)
      },
    },
  }
}
