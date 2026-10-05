// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { CalendarRange } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { useState } from 'react'

import { SelectInput } from '@surefy/ui/components/Forms'
import { Button } from '@surefy/ui/primitives/button'
import { Calendar } from '@surefy/ui/primitives/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@surefy/ui/primitives/popover'

import { INSIGHTS_RANGES } from '../InsightsOverview.constants'
import { isValidCustomRange } from '../InsightsOverview.utils'

import type { InsightsRangeOption } from '../InsightsOverview.constants'

interface RangePickerProps {
  range: InsightsRangeOption
  /** The days the range covers, both included (`2026-09-01`). */
  first: string
  last: string
  timeZone: string
  onRangeChange: (next: {
    range: InsightsRangeOption
    from: string | null
    to: string | null
  }) => void
}

const toDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const fromDay = (day: string) => {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number)
  return new Date(year, month - 1, date)
}

/** Today, 7d, 30d, 90d, or Custom: a calendar for the first and last day, in the person's time zone. */
export default function RangePicker({
  range,
  first,
  last,
  timeZone,
  onRangeChange,
}: Readonly<RangePickerProps>) {
  const t = useTranslations('insights.overview.filters')
  const format = useFormatter()
  const [isOpen, setIsOpen] = useState(false)
  const [draft, setDraft] = useState<{ from?: Date; to?: Date }>({
    from: fromDay(first),
    to: fromDay(last),
  })
  const draftFrom = draft.from ? toDay(draft.from) : null
  const draftTo = draft.to ? toDay(draft.to) : null
  const dayLabel = (day: string) => format.dateTime(fromDay(day), { dateStyle: 'medium' })

  return (
    <div className="flex items-center gap-2">
      <SelectInput
        aria-label={t('range')}
        options={INSIGHTS_RANGES.map((value) => ({ value, label: t(`ranges.${value}`) }))}
        value={range}
        onValueChange={(value) => {
          if (value === 'custom') {
            setDraft({ from: fromDay(first), to: fromDay(last) })
            setIsOpen(true)
            return
          }
          onRangeChange({ range: value, from: null, to: null })
        }}
        className="w-40"
      />
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button variant="secondary" icon={CalendarRange} aria-label={t('customRange')}>
            {range === 'custom'
              ? t('customRangeValue', { from: dayLabel(first), to: dayLabel(last) })
              : t('customRange')}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="flex w-auto flex-col gap-3 p-3">
          <Calendar
            mode="range"
            numberOfMonths={2}
            selected={draft.from ? { from: draft.from, to: draft.to } : undefined}
            onSelect={(next) => {
              setDraft({ from: next?.from, to: next?.to })
            }}
            disabled={{ after: new Date() }}
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-caption text-muted-foreground">
              {t('customRangeHint', { timeZone })}
            </p>
            <Button
              size="sm"
              disabled={!isValidCustomRange(draftFrom, draftTo ?? draftFrom)}
              onClick={() => {
                if (!draftFrom) return
                onRangeChange({ range: 'custom', from: draftFrom, to: draftTo ?? draftFrom })
                setIsOpen(false)
              }}
            >
              {t('customApply')}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
