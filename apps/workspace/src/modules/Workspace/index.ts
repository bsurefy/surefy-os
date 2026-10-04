// SPDX-License-Identifier: AGPL-3.0-only
// The Workspace module: the app shell, navigation, notifications, profile and the no-access state.
export { default as NoAccessState } from './NoAccessState'
export { default as NotificationCenter } from './NotificationCenter'
export { loadNotificationFilters } from './NotificationCenter/NotificationCenter.searchParams'
export { default as PageBreadcrumb } from './PageBreadcrumb'
export { default as ProfileSettings } from './ProfileSettings'
export { default as WorkspaceShell } from './WorkspaceShell'
export { NAV_ITEM_KEYS, WORKSPACE_NAV } from './Workspace.constants'
export { assertNavReleased, isNavReleased } from './Workspace.server'
export type {
  NavEntry,
  NavGroup,
  NavItemKey,
  NoAccessArea,
  ShellCrumb,
  WorkspaceCommand,
} from './Workspace.types'
