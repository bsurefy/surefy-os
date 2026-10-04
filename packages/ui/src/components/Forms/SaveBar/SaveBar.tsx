// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { cn } from '../../../lib/utils'
import { Button } from '../../../primitives/button'

import type { SaveBarProps } from './SaveBar.types'

/** Sticky bar for pages with many settings: "3 unsaved changes · Discard · Save". */
export default function SaveBar({
  labels,
  isDirty,
  isSaving = false,
  onDiscard,
  formId,
  onSave,
  className,
}: Readonly<SaveBarProps>) {
  if (!isDirty) return null
  return (
    <div
      role="region"
      aria-label={labels.message}
      className={cn(
        'border-border bg-surface motion-safe:animate-in motion-safe:slide-in-from-bottom-2 z-sticky sticky bottom-0 flex items-center justify-end gap-2 border-t px-4 py-3 shadow-md md:px-6',
        className,
      )}
    >
      <p aria-live="polite" className="text-body text-foreground-secondary mr-auto">
        {labels.message}
      </p>
      <Button variant="secondary" onClick={onDiscard} disabled={isSaving}>
        {labels.discard}
      </Button>
      <Button
        type={formId ? 'submit' : 'button'}
        form={formId}
        isLoading={isSaving}
        onClick={formId ? undefined : onSave}
      >
        {labels.save}
      </Button>
    </div>
  )
}
