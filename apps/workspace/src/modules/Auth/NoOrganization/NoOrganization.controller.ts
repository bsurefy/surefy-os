// SPDX-License-Identifier: AGPL-3.0-only
import { useTranslations } from 'next-intl'

import { useSignOut } from '@/core/auth/useSignOut'

/** Signed in but a member of no organization: the way out is another account or an invitation. */
export function useNoOrganizationController() {
  const t = useTranslations('auth.noOrganization')
  const signOut = useSignOut()

  return {
    onSignOut: () => {
      void signOut()
    },
    t,
  }
}
