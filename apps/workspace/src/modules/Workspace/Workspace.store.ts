// SPDX-License-Identifier: AGPL-3.0-only
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { SIDEBAR_STORAGE_KEY } from './Workspace.constants'

import type { ShellCrumb } from './Workspace.types'

interface SidebarState {
  /** The person's choice; null follows the screen width (expanded from 1280px). */
  collapsedPreference: boolean | null
  /** Flips what the person currently sees. */
  toggle: (isCollapsedNow: boolean) => void
}

/** Sidebar collapsed or expanded, kept on this device across organizations. */
export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      collapsedPreference: null,
      toggle: (isCollapsedNow) => {
        set({ collapsedPreference: !isCollapsedNow })
      },
    }),
    {
      name: SIDEBAR_STORAGE_KEY,
      partialize: (state) => ({ collapsedPreference: state.collapsedPreference }),
      skipHydration: true, // the shell rehydrates after mount
    },
  ),
)

export type ShellOverlay = 'commands' | 'shortcuts' | 'mobileNav'

interface ShellOverlayState {
  open: ShellOverlay | null
  setOpen: (overlay: ShellOverlay, isOpen: boolean) => void
}

/** Which shell overlay is open: one at a time, so a shortcut never stacks two dialogs. */
export const useShellOverlayStore = create<ShellOverlayState>()((set) => ({
  open: null,
  setOpen: (overlay, isOpen) => {
    set((state) => {
      if (isOpen) return { open: overlay }
      return state.open === overlay ? { open: null } : state
    })
  },
}))

interface ShellCrumbState {
  crumbs: ShellCrumb[]
  setCrumbs: (crumbs: ShellCrumb[]) => void
  reset: () => void
}

/** The object levels of the top-bar breadcrumb, set by the page on screen (`PageBreadcrumb`). */
export const useShellCrumbStore = create<ShellCrumbState>()((set) => ({
  crumbs: [],
  setCrumbs: (crumbs) => {
    set({ crumbs })
  },
  reset: () => {
    set({ crumbs: [] })
  },
}))

export type ShellWidth = 'reading' | 'full' | 'flush'

interface ShellLayoutState {
  width: ShellWidth
  setWidth: (width: ShellWidth) => void
  reset: () => void
}

/** How wide the page content runs, set by the page on screen (`PageLayout`). */
export const useShellLayoutStore = create<ShellLayoutState>()((set) => ({
  width: 'reading',
  setWidth: (width) => {
    set({ width })
  },
  reset: () => {
    set({ width: 'reading' })
  },
}))
