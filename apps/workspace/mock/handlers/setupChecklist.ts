// SPDX-License-Identifier: AGPL-3.0-only
import {
  memberPreferencesDtoSchema,
  NOTIFICATION_DEFAULTS,
  NOTIFICATION_TYPES,
  okResponse,
  setupChecklistDtoSchema,
  updateMemberPreferencesInputSchema,
} from '@surefy/contracts'
import type { MemberPreferencesDto, SetupChecklistDto } from '@surefy/contracts'
import { defineMockDomain, defineMockHandler, mockOk } from '@surefy/web-core/testing/mock'

const checklistPath = '/orgs/:orgId/setup/checklist'
const preferencesPath = '/orgs/:orgId/members/me/preferences'

/** The MVP items: the agent and budget items belong to modules that arrive in V1. */
const startedChecklist: SetupChecklistDto = {
  items: [
    { key: 'connect-model', done: true },
    { key: 'add-documents', done: false },
    { key: 'invite-team', done: false },
  ],
  dismissed: false,
}

const freshChecklist: SetupChecklistDto = {
  items: startedChecklist.items.map((item) => ({ ...item, done: false })),
  dismissed: false,
}

const finishedChecklist: SetupChecklistDto = {
  items: startedChecklist.items.map((item) => ({ ...item, done: true })),
  dismissed: false,
}

// The dev mock server keeps the member's dismissal in memory, so dismissing hides it at once.
let isDismissed = false

/** Back to a checklist that is showing; tests call it between cases. */
export function resetSetupChecklistMock(): void {
  isDismissed = false
}

const withDismissal = (checklist: SetupChecklistDto): SetupChecklistDto => ({
  ...checklist,
  dismissed: isDismissed || checklist.dismissed,
})

const preferences = (checklistDismissed: boolean): MemberPreferencesDto => ({
  defaultModelKey: null,
  notifications: Object.fromEntries(
    NOTIFICATION_TYPES.map((type) => [
      type,
      { inApp: NOTIFICATION_DEFAULTS[type].inApp, email: NOTIFICATION_DEFAULTS[type].email },
    ]),
  ) as MemberPreferencesDto['notifications'],
  checklistDismissed,
  tableDensity: 'comfortable',
})

/**
 * The home-screen setup checklist and its dismissal, live on the real API (I4-02; the handlers
 * stay for component tests and for `MOCK_DOMAINS=setupChecklist`, to look at the states).
 * First-run setup itself is never mocked: it always uses the real backend. Scenarios: `fresh`
 * (nothing done), `finished` (everything done), `dismissed`; `empty` has no items.
 */
export const setupChecklistDomain = defineMockDomain(
  'setupChecklist',
  [
    defineMockHandler({
      method: 'get',
      path: checklistPath,
      response: okResponse(setupChecklistDtoSchema),
      scenarios: {
        default: () => mockOk(withDismissal(startedChecklist)),
        fresh: () => mockOk(withDismissal(freshChecklist)),
        finished: () => mockOk(withDismissal(finishedChecklist)),
        dismissed: () => mockOk({ ...startedChecklist, dismissed: true }),
        empty: () => mockOk({ items: [], dismissed: false }),
      },
    }),
    defineMockHandler({
      method: 'patch',
      path: preferencesPath,
      response: okResponse(memberPreferencesDtoSchema),
      scenarios: {
        default: async ({ request }) => {
          const input = updateMemberPreferencesInputSchema.parse(await request.json())
          isDismissed = input.checklistDismissed ?? isDismissed
          return mockOk(preferences(isDismissed))
        },
      },
    }),
  ],
  { isLive: true },
)
