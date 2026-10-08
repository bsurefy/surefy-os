// SPDX-License-Identifier: AGPL-3.0-only
import { NotFoundError } from '@/core/errors/index.js'
import { AGENTS_ERROR_CODES } from '@surefy/contracts'

export class AgentTemplateNotFoundError extends NotFoundError {
  constructor() {
    super(AGENTS_ERROR_CODES.AGENT_TEMPLATE_NOT_FOUND, 'Template not found')
  }
}
