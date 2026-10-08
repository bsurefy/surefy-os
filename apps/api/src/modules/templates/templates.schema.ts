// SPDX-License-Identifier: AGPL-3.0-only
import { agentTemplateListDtoSchema, okResponse, templatesParamsSchema } from '@surefy/contracts'

export const listTemplatesRoute = {
  tags: ['agents'],
  summary: 'The agent templates, with what each sets up for this organization',
  params: templatesParamsSchema,
  response: { 200: okResponse(agentTemplateListDtoSchema) },
}
