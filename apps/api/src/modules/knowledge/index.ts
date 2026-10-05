// SPDX-License-Identifier: AGPL-3.0-only
export {
  createKnowledgeModule,
  type KnowledgeModule,
  type KnowledgeModuleDeps,
} from './knowledge.module.js'
export { createKnowledgeFiles } from './knowledgeFiles.js'
export { createKnowledgeModels } from './knowledgeModels.js'
export { KNOWLEDGE_JOBS, KNOWLEDGE_SCHEDULER } from './knowledge.constants.js'
export type {
  RetrievalRequest,
  RetrievalResult,
  RetrievedPassage,
} from './knowledgeRetrieval/knowledgeRetrieval.service.js'
export type { KnowledgeContext, KnowledgeFiles, KnowledgeSearcher } from './knowledge.types.js'
