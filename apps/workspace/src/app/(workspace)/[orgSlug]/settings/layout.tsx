// SPDX-License-Identifier: AGPL-3.0-only
import { assertNavReleased } from '@/modules/Workspace'

/** Every settings page: the open section alone; the sidebar's Settings dropdown lists the sections. */
export default function SettingsLayout({ children }: Readonly<LayoutProps<'/[orgSlug]/settings'>>) {
  assertNavReleased('settings')
  return children
}
