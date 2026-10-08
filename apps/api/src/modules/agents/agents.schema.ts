// SPDX-License-Identifier: AGPL-3.0-only
import {
  agentAccessDtoSchema,
  agentDetailDtoSchema,
  agentDiffDtoSchema,
  agentDiffQuerySchema,
  agentDraftDtoSchema,
  agentDtoSchema,
  agentImpactDtoSchema,
  agentImpactQuerySchema,
  agentLifecycleParamsSchema,
  agentParamsSchema,
  agentReadinessDtoSchema,
  agentVersionDetailDtoSchema,
  agentVersionDtoSchema,
  agentVersionParamsSchema,
  createAgentInputSchema,
  deleteAgentQuerySchema,
  duplicateAgentInputSchema,
  listAgentsQuerySchema,
  listAgentVersionsQuerySchema,
  listUsableAgentsQuerySchema,
  okResponse,
  orgParamsSchema,
  pageResponse,
  publishAgentInputSchema,
  publishAgentResultDtoSchema,
  replaceAgentAccessInputSchema,
  rollbackAgentInputSchema,
  saveAgentDraftDtoSchema,
  saveAgentDraftInputSchema,
  updateAgentInputSchema,
  usableAgentDtoSchema,
} from '@surefy/contracts'

const TAGS = ['agents']

export const listAgentsRoute = {
  tags: TAGS,
  summary: 'The Agents list: agents the person owns or that are shared with them',
  params: orgParamsSchema,
  querystring: listAgentsQuerySchema,
  response: { 200: pageResponse(agentDtoSchema) },
}

export const listUsableAgentsRoute = {
  tags: TAGS,
  summary: 'Published agents the person may talk to, for the Chat picker',
  params: orgParamsSchema,
  querystring: listUsableAgentsQuerySchema,
  response: { 200: pageResponse(usableAgentDtoSchema) },
}

export const createAgentRoute = {
  tags: TAGS,
  summary: 'Create an agent from a template or from scratch',
  params: orgParamsSchema,
  body: createAgentInputSchema,
  response: { 201: okResponse(agentDetailDtoSchema) },
}

export const getAgentRoute = {
  tags: TAGS,
  summary: 'The agent with its draft and channels',
  params: agentParamsSchema,
  response: { 200: okResponse(agentDetailDtoSchema) },
}

export const updateAgentRoute = {
  tags: TAGS,
  summary: 'Change the name or description (live metadata, not versioned)',
  params: agentParamsSchema,
  body: updateAgentInputSchema,
  response: { 200: okResponse(agentDtoSchema) },
}

export const deleteAgentRoute = {
  tags: TAGS,
  summary: 'Delete an agent; a published one or one with runs becomes a tombstone',
  params: agentParamsSchema,
  querystring: deleteAgentQuerySchema,
}

export const getDraftRoute = {
  tags: TAGS,
  summary: 'The editable draft and its revision',
  params: agentParamsSchema,
  response: { 200: okResponse(agentDraftDtoSchema) },
}

export const saveDraftRoute = {
  tags: TAGS,
  summary: 'Autosave the draft; 409 AGENT_EDIT_CONFLICT when it moved since baseRevision',
  params: agentParamsSchema,
  body: saveAgentDraftInputSchema,
  response: { 200: okResponse(saveAgentDraftDtoSchema) },
}

export const agentImpactRoute = {
  tags: TAGS,
  summary: 'What pausing, archiving or deleting the agent affects',
  params: agentParamsSchema,
  querystring: agentImpactQuerySchema,
  response: { 200: okResponse(agentImpactDtoSchema) },
}

export const duplicateAgentRoute = {
  tags: TAGS,
  summary: 'A draft copy owned by the caller, with no channels and no audience',
  params: agentParamsSchema,
  body: duplicateAgentInputSchema,
  response: { 201: okResponse(agentDetailDtoSchema) },
}

const lifecycle = (summary: string) => ({
  tags: TAGS,
  summary,
  params: agentLifecycleParamsSchema,
  response: { 200: okResponse(agentDtoSchema) },
})

export const pauseAgentRoute = lifecycle('Pause: channels stop answering and no new run starts')
export const resumeAgentRoute = lifecycle('Resume a paused agent')
export const archiveAgentRoute = lifecycle('Archive: the editor turns read-only')
export const restoreAgentRoute = lifecycle(
  'Restore an archived agent (paused, or draft if never published)',
)

// ── Versions, readiness and publishing ──────────────────────────────────────────────────────────

export const readinessRoute = {
  tags: TAGS,
  summary: 'The readiness checklist: blocking items and warnings',
  params: agentParamsSchema,
  response: { 200: okResponse(agentReadinessDtoSchema) },
}

export const publishAgentRoute = {
  tags: TAGS,
  summary: 'Publish the draft as the next version, with the audience and channels',
  params: agentParamsSchema,
  body: publishAgentInputSchema,
  response: { 200: okResponse(publishAgentResultDtoSchema) },
}

export const rollbackAgentRoute = {
  tags: TAGS,
  summary: 'Point the live version at an earlier one; creates no version',
  params: agentParamsSchema,
  body: rollbackAgentInputSchema,
  response: { 200: okResponse(agentDtoSchema) },
}

export const listVersionsRoute = {
  tags: TAGS,
  summary: 'Versions, newest first',
  params: agentParamsSchema,
  querystring: listAgentVersionsQuerySchema,
  response: { 200: pageResponse(agentVersionDtoSchema) },
}

export const getVersionRoute = {
  tags: TAGS,
  summary: 'One version with its frozen definition',
  params: agentVersionParamsSchema,
  response: { 200: okResponse(agentVersionDetailDtoSchema) },
}

export const versionDiffRoute = {
  tags: TAGS,
  summary: 'What changes going from this version to the draft, the live version or another version',
  params: agentVersionParamsSchema,
  querystring: agentDiffQuerySchema,
  response: { 200: okResponse(agentDiffDtoSchema) },
}

// ── Audience ────────────────────────────────────────────────────────────────────────────────────

export const getAccessRoute = {
  tags: TAGS,
  summary: 'Who can use the agent',
  params: agentParamsSchema,
  response: { 200: okResponse(agentAccessDtoSchema) },
}

export const replaceAccessRoute = {
  tags: TAGS,
  summary: 'Replace the audience; the agent’s model must be allowed for everyone added',
  params: agentParamsSchema,
  body: replaceAgentAccessInputSchema,
  response: { 200: okResponse(agentAccessDtoSchema) },
}
