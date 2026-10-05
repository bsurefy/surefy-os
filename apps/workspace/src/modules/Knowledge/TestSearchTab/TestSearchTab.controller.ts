// SPDX-License-Identifier: AGPL-3.0-only
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { useKnowledgeTestSearchMutation } from '@/api/knowledge'
import { KNOWLEDGE_SEARCH_LIMITS } from '@surefy/contracts'
import type { KnowledgeBaseDto, KnowledgeSearchAs } from '@surefy/contracts'
import { useCurrentOrgId } from '@surefy/web-core/access'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'

import { useTeamOptions } from '../Knowledge.hooks'

export const SEARCH_AS_ME = 'me'
const PERCENT = 100

/** Test search: the question and its settings, and what the same retrieval chat uses found. */
export function useTestSearchController(base: KnowledgeBaseDto) {
  const t = useTranslations('knowledge.detail.testSearch')
  const tErrors = useTranslations('errors')
  const orgId = useCurrentOrgId()
  const search = useKnowledgeTestSearchMutation(orgId, base.id, { silent: true })
  const { teams } = useTeamOptions()
  const [question, setQuestion] = useState('')
  const [minRelevancePercent, setMinRelevancePercent] = useState(
    KNOWLEDGE_SEARCH_LIMITS.minRelevanceDefault * PERCENT,
  )
  const [passages, setPassages] = useState<number | null>(KNOWLEDGE_SEARCH_LIMITS.passagesDefault)
  const [searchAs, setSearchAs] = useState<string>(SEARCH_AS_ME)
  const [includeAnswer, setIncludeAnswer] = useState(true)

  const toSearchAs = (): KnowledgeSearchAs =>
    searchAs === SEARCH_AS_ME ? { type: 'me' } : { type: 'team', teamId: searchAs }

  return {
    t,
    canSearch: base.embeddingModel !== null,
    question,
    onQuestionChange: setQuestion,
    minRelevancePercent,
    onMinRelevanceChange: setMinRelevancePercent,
    passages,
    onPassagesChange: setPassages,
    searchAs,
    onSearchAsChange: setSearchAs,
    searchAsOptions: [
      { value: SEARCH_AS_ME, label: t('searchAs.me') },
      ...teams.map((team) => ({ value: team.id, label: t('searchAs.team', { name: team.name }) })),
    ],
    includeAnswer,
    onIncludeAnswerChange: setIncludeAnswer,
    isSearching: search.isPending,
    result: search.data,
    errorMessage: search.error ? getErrorMessage(search.error, tErrors) : null,
    errorReference: isApiError(search.error) ? search.error.requestId : undefined,
    isSubmittable: question.trim() !== '' && passages !== null,
    onSubmit: () => {
      if (question.trim() === '' || passages === null) return
      search.mutate({
        question: question.trim(),
        minRelevance: minRelevancePercent / PERCENT,
        passagesPerAnswer: passages,
        searchAs: toSearchAs(),
        includeAnswer,
      })
    },
  }
}
