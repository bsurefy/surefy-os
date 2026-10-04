// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { createContext, createElement, useContext, type ReactNode } from 'react'

/**
 * Generic built-in labels of @surefy/ui (a dialog's screen-reader "Close", "Retry"). The apps fill
 * them from the shared `common` namespace through `UiLabelsProvider`; these English defaults only
 * show in tests and the design-system showcase.
 */
export interface UiLabels {
  close: string
  dismiss: string
  cancel: string
  retry: string
  copy: string
  copied: string
  loading: string
  previous: string
  next: string
  openFullPage: string
  /** Name of the toast region ("Notifications"). */
  notifications: string
}

export const DEFAULT_UI_LABELS: UiLabels = {
  close: 'Close',
  dismiss: 'Dismiss',
  cancel: 'Cancel',
  retry: 'Try again',
  copy: 'Copy',
  copied: 'Copied',
  loading: 'Loading',
  previous: 'Previous',
  next: 'Next',
  openFullPage: 'Open full page',
  notifications: 'Notifications',
}

const UiLabelsContext = createContext<UiLabels>(DEFAULT_UI_LABELS)

export function UiLabelsProvider({
  labels,
  children,
}: Readonly<{ labels: Partial<UiLabels>; children: ReactNode }>) {
  return createElement(
    UiLabelsContext.Provider,
    { value: { ...DEFAULT_UI_LABELS, ...labels } },
    children,
  )
}

export function useUiLabels() {
  return useContext(UiLabelsContext)
}
