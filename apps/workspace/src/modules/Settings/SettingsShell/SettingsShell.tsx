// SPDX-License-Identifier: AGPL-3.0-only
import SettingsNav from './SettingsNav'

import type { SettingsShellProps } from './SettingsShell.types'

/** The Settings area: its one inner navigation beside the open section (navigation.md §6). */
export default function SettingsShell({ orgSlug, children }: Readonly<SettingsShellProps>) {
  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
      <SettingsNav orgSlug={orgSlug} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
