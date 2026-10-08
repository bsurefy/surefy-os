// SPDX-License-Identifier: AGPL-3.0-only
import type { ApprovalDetailDto, ApprovalPayload } from '@surefy/contracts'

export type FieldKind = 'text' | 'number' | 'locked'

/** Text and numbers can be edited before approving; anything nested is shown but not editable. */
export function getFieldKind(value: unknown): FieldKind {
  if (typeof value === 'string') return 'text'
  if (typeof value === 'number') return 'number'
  return 'locked'
}

/** A value as the person reads it: text as written, numbers plain, anything else as JSON. */
export function formatFieldValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  return value === undefined ? '' : JSON.stringify(value)
}

/** "orderId" and "order_id" both read "Order id". */
export function humanizeKey(key: string): string {
  const words = key
    .replaceAll(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replaceAll(/[_.-]+/g, ' ')
    .trim()
    .toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** The editable fields of an input as the strings the form holds. */
export function toFieldDraft(input: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, formatFieldValue(value)]),
  )
}

export interface EditedInput {
  /** The whole input with the edits applied: what the action runs with. */
  input: Record<string, unknown>
  /** Fields that hold something that cannot be the field's type (a number field with letters). */
  invalidKeys: string[]
  isChanged: boolean
}

/** Turns the form's strings back into the original types and finds what changed. */
export function getEditedInput(
  original: Record<string, unknown>,
  draft: Record<string, string>,
): EditedInput {
  const input: Record<string, unknown> = { ...original }
  const invalidKeys: string[] = []
  let isChanged = false
  for (const [key, value] of Object.entries(original)) {
    const text = draft[key] ?? formatFieldValue(value)
    const kind = getFieldKind(value)
    if (kind === 'locked' || text === formatFieldValue(value)) continue
    if (kind === 'number') {
      const parsed = Number(text)
      if (text.trim() === '' || !Number.isFinite(parsed) || parsed < 0) {
        invalidKeys.push(key)
        continue
      }
      input[key] = parsed
    } else {
      input[key] = text
    }
    isChanged = true
  }
  return { input, invalidKeys, isChanged }
}

/** The fields the approval will run with: the approver's edits when there are any. */
export function getActionInput(detail: ApprovalDetailDto): Record<string, unknown> | null {
  const payload = detail.editedPayload ?? detail.payload
  return hasAction(payload) ? payload.action.input : null
}

export function hasAction(
  payload: ApprovalPayload,
): payload is Extract<ApprovalPayload, { kind: 'ai_action' | 'flow_step' }> {
  return payload.kind === 'ai_action' || payload.kind === 'flow_step'
}

/** Only AI actions and flow steps have fields to edit, and only while the item waits for the person. */
export function canEdit(detail: ApprovalDetailDto): boolean {
  return detail.status === 'pending' && detail.canDecide && hasAction(detail.payload)
}
