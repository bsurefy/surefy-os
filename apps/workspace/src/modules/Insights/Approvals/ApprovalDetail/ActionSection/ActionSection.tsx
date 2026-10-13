// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useTranslations } from 'next-intl'

import type { ApprovalDetailDto } from '@surefy/contracts'
import { Field } from '@surefy/ui/components/Forms'
import { Section } from '@surefy/ui/components/Layout'
import { Input } from '@surefy/ui/primitives/input'

import { formatFieldValue, getFieldKind, hasAction, humanizeKey } from '../ApprovalDetail.utils'

interface ActionSectionProps {
  item: ApprovalDetailDto
  input: Record<string, unknown> | null
  isEditing: boolean
  draft: Record<string, string>
  editedKeys: string[]
  fieldErrors: Record<string, string>
  onDraftChange: (key: string, value: string) => void
}

/**
 * What will happen. An AI action or flow step lists its action and fields (editable before
 * approving, with the old value kept beside an edit); a request lists what it asks for.
 */
export default function ActionSection({
  item,
  input,
  isEditing,
  draft,
  editedKeys,
  fieldErrors,
  onDraftChange,
}: Readonly<ActionSectionProps>) {
  const t = useTranslations('insights.approvals.detail')
  const payload = item.editedPayload ?? item.payload
  /** The fields as the AI proposed them; an edit keeps them beside the new value. */
  const proposed = hasAction(item.payload) ? item.payload.action.input : null

  return (
    <Section title={t('whatWillHappen')}>
      {hasAction(payload) && input && (
        <div className="flex flex-col gap-4">
          <p className="text-body">
            <span className="text-muted-foreground">{t('action')}: </span>
            <code className="font-mono">{payload.action.name}</code>
          </p>
          <dl className="flex flex-col gap-3">
            {Object.entries(input).map(([key, value]) => {
              const kind = getFieldKind(value)
              const isEdited = isEditing
                ? editedKeys.includes(key)
                : item.editedPayload !== null && proposed?.[key] !== value
              return (
                <div key={key} className="flex flex-col gap-1">
                  {isEditing && kind !== 'locked' ? (
                    <Field label={humanizeKey(key)} error={fieldErrors[key]}>
                      <Input
                        value={draft[key] ?? ''}
                        inputMode={kind === 'number' ? 'decimal' : undefined}
                        onChange={(event) => {
                          onDraftChange(key, event.target.value)
                        }}
                      />
                    </Field>
                  ) : (
                    <>
                      <dt className="text-caption text-muted-foreground">{humanizeKey(key)}</dt>
                      <dd className="text-body break-words">{formatFieldValue(value)}</dd>
                      {kind === 'locked' && isEditing && (
                        <p className="text-caption text-muted-foreground">{t('readOnlyField')}</p>
                      )}
                    </>
                  )}
                  {isEdited && (
                    <p className="text-caption text-warning">
                      {t('was', { value: formatFieldValue(proposed?.[key]) })}
                    </p>
                  )}
                </div>
              )
            })}
          </dl>
        </div>
      )}
      {(payload.kind === 'bridge_install' || payload.kind === 'bridge_update') && (
        <div className="flex flex-col gap-3">
          <ScopeList title={t('bridge.scopes')} scopes={payload.requestedScopes} />
          {payload.kind === 'bridge_update' && (
            <ScopeList title={t('bridge.addedScopes')} scopes={payload.addedScopes} />
          )}
        </div>
      )}
      {payload.kind === 'channel_publish' && (
        <dl className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <dt className="text-caption text-muted-foreground">{t('channel.type')}</dt>
            <dd className="text-body">{payload.channelType}</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-caption text-muted-foreground">{t('channel.exposure')}</dt>
            <dd className="text-body">{payload.exposure}</dd>
          </div>
        </dl>
      )}
    </Section>
  )
}

function ScopeList({ title, scopes }: Readonly<{ title: string; scopes: string[] }>) {
  if (scopes.length === 0) return null
  return (
    <div className="flex flex-col gap-1">
      <p className="text-caption text-muted-foreground">{title}</p>
      <ul className="flex flex-wrap gap-2">
        {scopes.map((scope) => (
          <li key={scope} className="bg-surface-2 text-body rounded-md px-2 py-0.5 font-mono">
            {scope}
          </li>
        ))}
      </ul>
    </div>
  )
}
