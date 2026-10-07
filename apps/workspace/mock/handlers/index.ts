// SPDX-License-Identifier: AGPL-3.0-only
import type { MockDomain } from '@surefy/web-core/testing/mock'

import { accessDomain } from './access'
import { auditDomain } from './audit'
import { chatDomain } from './chat'
import { dataControlDomain } from './dataControl'
import { installDomain } from './install'
import { knowledgeDomain } from './knowledge'
import { meDomain } from './me'
import { membersDomain } from './members'
import { modelsDomain } from './models'
import { notificationsDomain } from './notifications'
import { organizationsDomain } from './organizations'
import { setupChecklistDomain } from './setupChecklist'
import { teamsDomain } from './teams'
import { usageDomain } from './usage'
import { vaultDomain } from './vault'

/**
 * Every mocked API domain, one `mock/handlers/<domain>.ts` each (testing.md §5), named after its
 * contract domain. A module's tasks edit only their own domain file, never this list. Sign-in and
 * setup are never registered: they always use the real authentication backend.
 */
export const mockDomains: MockDomain[] = [
  meDomain,
  accessDomain,
  notificationsDomain,
  organizationsDomain,
  membersDomain,
  teamsDomain,
  dataControlDomain,
  installDomain,
  vaultDomain,
  modelsDomain,
  chatDomain,
  knowledgeDomain,
  usageDomain,
  setupChecklistDomain,
  auditDomain,
]
