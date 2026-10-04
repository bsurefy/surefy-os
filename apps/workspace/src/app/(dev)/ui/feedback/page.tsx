// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useState } from 'react'

import {
  Banner,
  ConfidenceBar,
  ConfidenceChip,
  ErrorState,
  ProgressBar,
  SessionBanner,
  SkeletonCard,
  SkeletonText,
  Spinner,
  Toaster,
  toast,
} from '@surefy/ui/components/Feedback'
import { Field, SliderInput } from '@surefy/ui/components/Forms'
import { PageHeader, Section, Stack } from '@surefy/ui/components/Layout'
import { Button } from '@surefy/ui/primitives/button'

import OverlaysDemo from './OverlaysDemo'

const bandLabels = { high: 'Automatic', medium: 'AI double-check', low: 'Needs a person' }

export default function FeedbackShowcase() {
  const [low, setLow] = useState(60)
  const [high, setHigh] = useState(90)
  const [isBannerShown, setIsBannerShown] = useState(true)
  const thresholds = { low: low / 100, high: high / 100 }

  return (
    <>
      <SessionBanner
        kind="access"
        message="Support (Lena K.) is viewing this organization · Ticket 4821 · until 14:30 UTC"
        action={
          <Button size="sm" variant="secondary">
            End session
          </Button>
        }
      />
      <main className="mx-auto w-full max-w-4xl px-4 py-8 md:px-6">
        <Stack gap={6}>
          <PageHeader
            title="Feedback and overlays"
            description="Loading, errors, banners, toasts, confidence, confirmations, panels and the palette."
          />

          <Section title="Loading">
            <div className="flex items-center gap-4">
              <Spinner size="sm" />
              <Spinner size="md" />
              <Spinner size="lg" label="Loading runs" />
              <Button isLoading>Saving</Button>
            </div>
            <ProgressBar label="Indexing Product docs" value={42} valueText="84 of 200 files" />
            <div className="grid gap-4 md:grid-cols-2">
              <SkeletonCard />
              <SkeletonText lines={4} />
            </div>
          </Section>

          <Section title="Error state">
            <div className="border-border rounded-lg border border-dashed">
              <ErrorState
                title="Couldn't load runs"
                message="The rest of SurefyOS is working; only this page failed. Try again in a moment."
                details="Error 503 · 10:42 UTC"
                reference="req_7c1e94"
                onRetry={() => {
                  toast.info('Retrying…')
                }}
                secondaryAction={<Button variant="ghost">Contact support</Button>}
              />
            </div>
          </Section>

          <Section title="Banners">
            <Banner
              tone="warning"
              title="You're offline"
              description="Showing what was loaded at 10:41. Changes are paused until you reconnect."
              action={
                <Button size="sm" variant="secondary">
                  Try now
                </Button>
              }
            />
            <Banner tone="info" title="View only" description="Only Admins can change budgets." />
            {isBannerShown && (
              <Banner
                tone="success"
                title="Import finished"
                description="1,284 members were added."
                onDismiss={() => {
                  setIsBannerShown(false)
                }}
              />
            )}
            <Banner
              tone="destructive"
              title="Support's monthly AI budget is used up"
              description="Local models still work."
              action={
                <Button size="sm" variant="secondary">
                  Ask an admin for more
                </Button>
              }
            />
            <SessionBanner
              kind="staging"
              message="Staging environment · data is reset every Sunday"
            />
            <SessionBanner kind="sandbox" message="Sandbox · test data only" />
          </Section>

          <Section
            title="Confidence"
            description="Thresholds come from the organization's Guard settings."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Low threshold">
                <SliderInput
                  label="Low threshold"
                  value={low}
                  onValueChange={setLow}
                  min={0}
                  max={high}
                  suffix="%"
                />
              </Field>
              <Field label="High threshold">
                <SliderInput
                  label="High threshold"
                  value={high}
                  onValueChange={setHigh}
                  min={low}
                  max={100}
                  suffix="%"
                />
              </Field>
            </div>
            {[0.94, 0.72, 0.41].map((value) => (
              <ConfidenceBar
                key={value}
                label="Confidence"
                value={value}
                thresholds={thresholds}
                bandLabels={bandLabels}
              />
            ))}
            <ConfidenceBar
              label="Confidence"
              size="sm"
              value={0.88}
              thresholds={thresholds}
              bandLabels={bandLabels}
            />
            <div className="flex flex-wrap gap-2">
              {[0.97, 0.9, 0.75, 0.6, 0.32].map((value) => (
                <ConfidenceChip
                  key={value}
                  value={value}
                  thresholds={thresholds}
                  bandLabels={bandLabels}
                />
              ))}
            </div>
          </Section>

          <Section
            title="Toasts"
            description="Bottom-right, bottom-center on mobile, max 3, Alt+T focuses them."
          >
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  toast.success('Invite sent to sofia@acme.com')
                }}
              >
                Success
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  toast.warning('Key expires in 5 days', {
                    description: 'Add a new OpenAI key before Oct 9.',
                  })
                }}
              >
                Warning
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  toast.error("Couldn't save the agent", {
                    description: 'Error 503 · req_7c1e94',
                    action: {
                      label: 'Copy details',
                      onClick: () => {
                        void navigator.clipboard.writeText('Error 503 · req_7c1e94')
                      },
                    },
                  })
                }}
              >
                Error with action
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  toast.undo('Moved to Archive', {
                    undoLabel: 'Undo',
                    onUndo: () => {
                      toast.info('Moved back')
                    },
                  })
                }}
              >
                Undo (T1)
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  toast.promise(
                    new Promise((resolve) => {
                      globalThis.setTimeout(resolve, 1500)
                    }),
                    {
                      loading: 'Exporting members…',
                      success: 'Export ready',
                      error: 'Export failed',
                    },
                  )
                }}
              >
                Promise
              </Button>
            </div>
          </Section>

          <OverlaysDemo />
        </Stack>
      </main>
      <Toaster />
    </>
  )
}
