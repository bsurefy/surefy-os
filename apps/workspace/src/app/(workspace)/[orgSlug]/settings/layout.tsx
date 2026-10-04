// SPDX-License-Identifier: AGPL-3.0-only
import { SettingsShell } from '@/modules/Settings'
import { assertNavReleased } from '@/modules/Workspace'

/** Every settings page: the settings navigation beside the open section. */
export default async function SettingsLayout({
  children,
  params,
}: Readonly<LayoutProps<'/[orgSlug]/settings'>>) {
  assertNavReleased('settings')
  const { orgSlug } = await params
  return <SettingsShell orgSlug={orgSlug}>{children}</SettingsShell>
}
