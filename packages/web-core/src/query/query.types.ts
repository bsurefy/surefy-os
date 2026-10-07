// SPDX-License-Identifier: AGPL-3.0-only
/** Side effects of the global error handlers; the query layer itself never navigates or renders. */
export interface QueryClientHandlers {
  /** Opens the session-expired dialog. */
  onUnauthenticated: () => void
  /** Invalidates effective access, so the screen shows the upgrade card. */
  onFeatureUnavailable: () => void
  /** Shows the translated error toast. */
  showError: (error: unknown) => void
}

/** Queries never toast by default; set `errorToast` only for background queries without an error state. */
export interface QueryMeta extends Record<string, unknown> {
  errorToast?: boolean
}

/** Mutations toast by default; a controller that shows the error itself (a form) sets `silent`. */
export interface MutationMeta extends Record<string, unknown> {
  silent?: boolean
}

/** The options every `use<Verb><Resource>Mutation` hook takes. */
export interface MutationHookOptions {
  /** The caller shows the error itself (a form), so the global error toast stays quiet. */
  silent?: boolean
}

// Typed once for every app that imports `@surefy/web-core/query`.
declare module '@tanstack/react-query' {
  interface Register {
    queryMeta: QueryMeta
    mutationMeta: MutationMeta
  }
}
