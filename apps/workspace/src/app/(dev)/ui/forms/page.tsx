// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { LayoutGrid, List } from 'lucide-react'
import { useState } from 'react'

import {
  Combobox,
  Field,
  FieldSet,
  MultiSelect,
  NumberInput,
  SecretInput,
  SegmentedControl,
  SelectInput,
  SliderInput,
  SwitchField,
} from '@surefy/ui/components/Forms'
import type { ComboboxOption } from '@surefy/ui/components/Forms'
import { PageHeader, Section, Stack } from '@surefy/ui/components/Layout'
import { Button } from '@surefy/ui/primitives/button'
import { Checkbox } from '@surefy/ui/primitives/checkbox'
import { Input } from '@surefy/ui/primitives/input'
import { Label } from '@surefy/ui/primitives/label'
import { RadioGroup, RadioGroupItem } from '@surefy/ui/primitives/radio-group'
import { Textarea } from '@surefy/ui/primitives/textarea'

import UploadDemo from './UploadDemo'
import ValidationDemo from './ValidationDemo'

const models: ComboboxOption[] = [
  'GPT-5.1',
  'GPT-5.1 mini',
  'Claude Opus',
  'Claude Sonnet',
  'Claude Haiku',
  'Gemini Pro',
  'Gemini Flash',
  'Mistral Large',
  'Mistral Small',
  'Llama 4 Maverick',
  'Llama 4 Scout',
  'DeepSeek V3',
  'Qwen 3',
  'Command R+',
].map((name) => ({
  value: name.toLowerCase().replaceAll(' ', '-'),
  label: name,
  description: 'Chat · 128k context',
}))

const people: ComboboxOption[] = [
  'Ana Ruiz',
  'Ben Okafor',
  'Chen Wei',
  'Dana Levi',
  'Elif Kaya',
  'Farah Haddad',
].map((name) => ({
  value: name.toLowerCase().replaceAll(' ', '.'),
  label: name,
  description: `${name.split(' ')[0]?.toLowerCase() ?? ''}@acme.com`,
}))

const teams: ComboboxOption[] = ['Support', 'Sales', 'Legal', 'Finance', 'Research', 'Design'].map(
  (name) => ({ value: name.toLowerCase(), label: name }),
)

const channels = ['Email', 'In-app', 'Slack']

export default function FormsShowcase() {
  const [budget, setBudget] = useState<number | null>(2500)
  const [share, setShare] = useState<number | null>(12.5)
  const [seats, setSeats] = useState<number | null>(380)
  const [language, setLanguage] = useState('en')
  const [model, setModel] = useState<string | null>(null)
  const [owner, setOwner] = useState<string | null>(null)
  const [ownerResults, setOwnerResults] = useState(people)
  const [isSearching, setIsSearching] = useState(false)
  const [members, setMembers] = useState(['support', 'sales', 'legal', 'finance', 'research'])
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [period, setPeriod] = useState('30d')
  const [threshold, setThreshold] = useState(80)
  const [picked, setPicked] = useState<string[]>(['Email'])

  const handleOwnerSearch = (query: string) => {
    setIsSearching(true)
    // Stands in for an API search.
    globalThis.setTimeout(() => {
      setOwnerResults(
        people.filter((person) => person.label.toLowerCase().includes(query.toLowerCase())),
      )
      setIsSearching(false)
    }, 400)
  }

  let allChannels: boolean | 'indeterminate' = 'indeterminate'
  if (picked.length === 0) allChannels = false
  else if (picked.length === channels.length) allChannels = true

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 md:px-6">
      <Stack gap={6}>
        <PageHeader
          title="Forms"
          description="Fields, selects, comboboxes, choices, switches, sliders, secrets and file uploads."
        />

        <Section title="Text fields" description="Labels above, help text below the label.">
          <Field label="Organization name" description="Shown to members and on invoices.">
            <Input defaultValue="Acme Logistics" />
          </Field>
          <Field label="Nickname" optionalLabel="(optional)">
            <Input placeholder="Acme" />
          </Field>
          <Field label="Work email" error="Enter a work email, like name@company.com">
            <Input type="email" defaultValue="ana@" />
          </Field>
          <Field label="Description" description="At least 3 rows.">
            <Textarea placeholder="What this team works on" />
          </Field>
          <Field label="Organization ID">
            <Input disabled defaultValue="org_01J8Z6" />
          </Field>
        </Section>

        <Section title="Numbers" description="Unit adornments, locale formatting, min and max.">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Monthly budget">
              <NumberInput
                value={budget}
                onValueChange={setBudget}
                min={0}
                prefix="$"
                formatOptions={{ maximumFractionDigits: 2 }}
              />
            </Field>
            <Field label="Share of credits">
              <NumberInput value={share} onValueChange={setShare} min={0} max={100} suffix="%" />
            </Field>
          </div>
          <Field
            label="Seats for this customer"
            description={
              seats !== null && seats > 400
                ? `Over your allocation by ${String(seats - 400)}`
                : `${String(400 - (seats ?? 0))} seats left in your allocation`
            }
          >
            <NumberInput
              value={seats}
              onValueChange={setSeats}
              min={0}
              step={10}
              suffix="seats"
              stepper={{ decrementLabel: 'Decrease seats', incrementLabel: 'Increase seats' }}
            />
          </Field>
        </Section>

        <Section title="Selects and comboboxes">
          <Field label="Default language" description="10 options or fewer: a plain select.">
            <SelectInput
              options={[
                { value: 'en', label: 'English' },
                { value: 'de', label: 'Deutsch' },
                { value: 'es', label: 'Español' },
              ]}
              value={language}
              onValueChange={setLanguage}
            />
          </Field>
          <Field label="Default model" description="More than 10 options: searchable.">
            <Combobox
              options={models}
              value={model}
              onValueChange={setModel}
              labels={{
                placeholder: 'Select a model',
                search: 'Search models',
                empty: 'No models match',
              }}
            />
          </Field>
          <Field label="Owner" description="Async search.">
            <Combobox
              options={ownerResults}
              value={owner}
              onValueChange={setOwner}
              onSearchChange={handleOwnerSearch}
              isLoading={isSearching}
              labels={{
                placeholder: 'Select a person',
                search: 'Search people',
                empty: 'No people match',
                loading: 'Searching…',
              }}
            />
          </Field>
          <Field label="Teams">
            <MultiSelect
              options={teams}
              value={members}
              onValueChange={setMembers}
              labels={{
                placeholder: 'Add teams',
                search: 'Add more',
                empty: 'No teams match',
                remove: (label) => `Remove ${label}`,
                more: (count) => `+${String(count)}`,
              }}
            />
          </Field>
        </Section>

        <Section title="Choices">
          <FieldSet legend="Notify me by">
            <div className="flex items-center gap-3">
              <Checkbox
                id="channel-all"
                checked={allChannels}
                onCheckedChange={(checked) => {
                  setPicked(checked === true ? channels : [])
                }}
              />
              <Label htmlFor="channel-all">All channels</Label>
            </div>
            {channels.map((channel) => (
              <div key={channel} className="flex items-center gap-3 pl-7">
                <Checkbox
                  id={`channel-${channel}`}
                  checked={picked.includes(channel)}
                  onCheckedChange={(checked) => {
                    setPicked((current) =>
                      checked === true
                        ? [...current, channel]
                        : current.filter((item) => item !== channel),
                    )
                  }}
                />
                <Label htmlFor={`channel-${channel}`}>{channel}</Label>
              </div>
            ))}
          </FieldSet>
          <FieldSet legend="Keep chats for" description="Applies to new chats.">
            <RadioGroup defaultValue="90" aria-label="Keep chats for">
              {['30', '90', '365'].map((days) => (
                <div key={days} className="flex items-center gap-3">
                  <RadioGroupItem id={`keep-${days}`} value={days} />
                  <Label htmlFor={`keep-${days}`}>{days} days</Label>
                </div>
              ))}
            </RadioGroup>
          </FieldSet>
          <div className="flex flex-wrap items-center gap-4">
            <SegmentedControl
              label="Period"
              value={period}
              onValueChange={setPeriod}
              options={[
                { value: '7d', label: '7 days' },
                { value: '30d', label: '30 days' },
                { value: '90d', label: '90 days' },
              ]}
            />
            <SegmentedControl
              label="View"
              size="sm"
              value={view}
              onValueChange={setView}
              options={[
                { value: 'grid', label: 'Grid', icon: LayoutGrid, isIconOnly: true },
                { value: 'list', label: 'List', icon: List, isIconOnly: true },
              ]}
            />
          </div>
        </Section>

        <Section title="Switches">
          <SwitchField
            label="Require two-factor authentication"
            description="Members set it up at their next sign-in."
            defaultChecked
          />
          <SwitchField label="Allow guest access" description="Guests see only shared chats." />
          <SwitchField label="Dense row switch (sm)" size="sm" defaultChecked />
          <SwitchField label="Disabled" disabled />
        </Section>

        <Section title="Slider" description="Threshold editing with the exact number next to it.">
          <Field label="High confidence from">
            <SliderInput
              label="High confidence from"
              value={threshold}
              onValueChange={setThreshold}
              min={50}
              max={100}
              suffix="%"
            />
          </Field>
        </Section>

        <Section
          title="Secret input"
          description="Show works only while focused; never re-shown after save."
        >
          <Field label="API key">
            <SecretInput
              placeholder="sk-…"
              labels={{ show: 'Show API key', hide: 'Hide API key' }}
              action={<Button variant="secondary">Test connection</Button>}
            />
          </Field>
          <Field label="Saved API key" description="Leave empty to keep the saved key.">
            <SecretInput
              placeholder="Saved · ends in 4f2a"
              labels={{ show: 'Show API key', hide: 'Hide API key' }}
            />
          </Field>
        </Section>

        <UploadDemo />
        <ValidationDemo />
      </Stack>
    </main>
  )
}
