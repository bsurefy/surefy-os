// SPDX-License-Identifier: AGPL-3.0-only
import { SkeletonCard, SkeletonText } from '@surefy/ui/components/Feedback'

/** While a page renders on the server: its frame in skeletons, inside the shell. */
export default function OrganizationLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <SkeletonText lines={2} className="max-w-md" />
      <SkeletonCard lines={4} />
    </div>
  )
}
