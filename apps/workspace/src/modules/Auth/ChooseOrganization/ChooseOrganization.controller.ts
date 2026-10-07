// SPDX-License-Identifier: AGPL-3.0-only
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

import { ROUTES } from '@/constants/routes'
import { toRoute } from '@/modules/Workspace'
import { useUpdateMeMutation } from '@surefy/web-core/api/me'

/** Opens the chosen organization and remembers it as the last used one. */
export function useChooseOrganizationController() {
  const t = useTranslations('auth.chooseOrganization')
  const router = useRouter()
  const { mutate, isPending, variables } = useUpdateMeMutation()

  return {
    pendingOrganizationId: isPending ? variables.lastOrganizationId : null,
    onChoose: (organization: { id: string; slug: string }) => {
      mutate(
        { lastOrganizationId: organization.id },
        {
          onSuccess: () => {
            router.push(toRoute(ROUTES.workspace.home(organization.slug)))
          },
        },
      )
    },
    t,
  }
}
