// SPDX-License-Identifier: AGPL-3.0-only
import { defineMockDomain } from '@surefy/web-core/testing/mock'

/**
 * Agent runs (Insights › Runs, the editor Test and Runs tabs). No handlers yet: the domain's screen task adds them here, one per endpoint, with a scenario
 * for every state of its screens. Until then its requests pass through to the real API.
 */
export const agentRunsDomain = defineMockDomain('agentRuns', [])
