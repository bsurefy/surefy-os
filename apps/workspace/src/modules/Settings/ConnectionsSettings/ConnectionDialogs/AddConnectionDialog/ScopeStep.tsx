// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useTranslations } from 'next-intl'

import type { ConnectionScope } from '@surefy/contracts'
import { Banner } from '@surefy/ui/components/Feedback'
import { SelectInput } from '@surefy/ui/components/Forms'
import { Button } from '@surefy/ui/primitives/button'
import { Label } from '@surefy/ui/primitives/label'
import { RadioGroup, RadioGroupItem } from '@surefy/ui/primitives/radio-group'

export interface ScopeStepProps {
  allowedScopes: ConnectionScope[]
  scope: ConnectionScope
  onScopeChange: (scope: ConnectionScope) => void
  teamOptions: { value: string; label: string }[]
  teamId: string | undefined
  onTeamChange: (teamId: string) => void
  isTeamsLoading: boolean
  /** The app's check failed or the account is already connected. */
  error: string | null
  isDuplicate: boolean
  isSaving: boolean
  canSave: boolean
  /** "Continue with Slack" for a sign-in at the app; "Connect" otherwise. */
  submitLabel: string
  onBack: () => void
  onSave: () => void
  onShowConnections: () => void
}

/** Step 3: who can use the connection. Save runs the app's check before storing anything. */
export default function ScopeStep(props: Readonly<ScopeStepProps>) {
  const t = useTranslations('settings.connections.add.scope')
  return (
    <div className="flex flex-col gap-4">
      {props.error && (
        <Banner
          tone="destructive"
          title={props.error}
          isAnnounced
          action={
            props.isDuplicate ? (
              <Button variant="link" size="sm" onClick={props.onShowConnections}>
                {t('reconnectIt')}
              </Button>
            ) : undefined
          }
        />
      )}
      <RadioGroup
        aria-label={t('label')}
        value={props.scope}
        onValueChange={(value) => {
          props.onScopeChange(value as ConnectionScope)
        }}
      >
        {props.allowedScopes.map((scope) => (
          <div key={scope} className="flex items-start gap-2">
            <RadioGroupItem id={`connection-scope-${scope}`} value={scope} className="mt-1" />
            <Label
              htmlFor={`connection-scope-${scope}`}
              className="flex flex-col items-start gap-0.5 text-left"
            >
              <span className="font-medium">{t(`${scope}.name`)}</span>
              <span className="text-caption text-muted-foreground font-normal">
                {t(`${scope}.description`)}
              </span>
            </Label>
          </div>
        ))}
      </RadioGroup>
      {props.scope === 'team' && (
        <SelectInput
          aria-label={t('teamSelect')}
          placeholder={props.isTeamsLoading ? t('teamLoading') : t('teamPlaceholder')}
          options={props.teamOptions}
          value={props.teamId}
          onValueChange={props.onTeamChange}
        />
      )}
      <div className="flex justify-between gap-2">
        <Button variant="secondary" type="button" onClick={props.onBack}>
          {t('back')}
        </Button>
        <Button
          type="button"
          isLoading={props.isSaving}
          disabled={!props.canSave}
          onClick={props.onSave}
        >
          {props.submitLabel}
        </Button>
      </div>
    </div>
  )
}
