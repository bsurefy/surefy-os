// SPDX-License-Identifier: AGPL-3.0-only
import type { MockDomain } from '@surefy/web-core/testing/mock'

/**
 * Every mocked API domain, one `mock/handlers/<domain>.ts` each (testing.md §5). The module
 * skeleton task adds the MVP domains; a module's tasks then edit only their own domain file.
 */
export const mockDomains: MockDomain[] = []
