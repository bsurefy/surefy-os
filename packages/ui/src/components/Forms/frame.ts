// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The input look for controls that wrap an inner `<input>` (adornments, toggles, chips): 36px
 * (44px on touch devices), radius `lg`, `input` border, destructive border when the inner input is
 * invalid, and the focus ring on the frame instead of the inner input.
 */
export const frameClassName =
  'border-input dark:bg-input/30 flex min-h-9 w-full min-w-0 items-center rounded-lg border bg-transparent pointer-coarse:min-h-11 has-[input:disabled]:cursor-not-allowed has-[input:disabled]:opacity-50 has-[[aria-invalid=true]]:border-destructive has-[input:focus-visible]:outline-ring has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-solid'

/** The inner `<input>` of a frame: no border, no own focus ring. */
export const frameInputClassName =
  'placeholder:text-muted-foreground h-full min-w-0 flex-1 bg-transparent px-3 text-base outline-none focus-visible:outline-none disabled:cursor-not-allowed md:text-sm'
