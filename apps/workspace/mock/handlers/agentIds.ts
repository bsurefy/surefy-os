// SPDX-License-Identifier: AGPL-3.0-only
import { fixtureUuid } from '@surefy/web-core/testing'

/** The kind that marks agent fixture ids (`fixtureUuid(AGENT_KIND, n)`). */
export const AGENT_KIND = 70

export const SUPPORT_AGENT_ID = fixtureUuid(AGENT_KIND, 1)
export const DRAFT_AGENT_ID = fixtureUuid(AGENT_KIND, 2)
export const ARCHIVED_AGENT_ID = fixtureUuid(AGENT_KIND, 3)
export const READ_ONLY_AGENT_ID = fixtureUuid(AGENT_KIND, 4)
export const RETIRED_MODEL_AGENT_ID = fixtureUuid(AGENT_KIND, 5)
