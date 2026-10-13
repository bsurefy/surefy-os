// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Banner } from '@surefy/ui/components/Feedback'
import { Field } from '@surefy/ui/components/Forms'
import { Section } from '@surefy/ui/components/Layout'
import { Button } from '@surefy/ui/primitives/button'
import { Textarea } from '@surefy/ui/primitives/textarea'

import AudienceSection from './AudienceSection'
import ChangesSection from './ChangesSection'
import ChannelsSection from './ChannelsSection'
import { usePublishTabController } from './PublishTab.controller'
import ReadinessSection from './ReadinessSection'

import type { PublishTabProps } from './PublishTab.types'

/** Publish: readiness, who can use the agent, channels, what changes, and the Publish button. */
export default function PublishTab(props: Readonly<PublishTabProps>) {
  const c = usePublishTabController(props)
  const { t } = c
  const { agent, definition, isReadOnly } = props

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <ReadinessSection
        readiness={c.readiness.data}
        isLoading={c.readiness.isLoading}
        errorMessage={c.readiness.errorMessage}
        errorReference={c.readiness.errorReference}
        onRetry={c.readiness.refetch}
        tabHref={c.tabHref}
      />
      <AudienceSection agent={agent} isReadOnly={isReadOnly} />
      <ChannelsSection
        agent={agent}
        definition={definition}
        canChange={c.canChange}
        requests={c.requests}
        onRequestChange={c.onRequestChange}
        widgetToken={c.widgetToken}
        onWidgetTokenChange={c.onWidgetTokenChange}
      />
      <ChangesSection liveVersion={c.liveVersion} changes={c.changes} />
      <Section title={t('form.title')}>
        <div className="flex flex-col gap-4">
          {c.failureMessage && (
            <Banner
              tone="destructive"
              isAnnounced
              title={t('failure.title')}
              description={`${c.failureMessage} ${t('failure.previousStaysLive')}`}
              action={
                <Button size="sm" variant="secondary" onClick={c.onPublish}>
                  {t('failure.retry')}
                </Button>
              }
            />
          )}
          <Field label={t('notes.label')} description={t('notes.help')}>
            <Textarea
              value={c.notes}
              maxLength={2000}
              onChange={(event) => {
                c.onNotesChange(event.target.value)
              }}
              disabled={!c.canChange}
            />
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={c.onPublish}
              isLoading={c.isPublishing}
              disabled={c.blockedReason !== null}
            >
              {c.isPublishing ? t('publishing') : c.publishLabel}
            </Button>
            {c.blockedReason && (
              <span className="text-body text-muted-foreground">{c.blockedReason}</span>
            )}
          </div>
        </div>
      </Section>
    </div>
  )
}
