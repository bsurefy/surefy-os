// SPDX-License-Identifier: AGPL-3.0-only
import { defineMockDomain } from '@surefy/web-core/testing/mock'

/**
 * Provider keys, local servers, model access and fallback (Vault). No handlers yet: the domain's screen task adds them here, one per endpoint, with a scenario
 * for every state of its screens. Until then its requests pass through to the real API.
 */
export const vaultDomain = defineMockDomain('vault', [])
