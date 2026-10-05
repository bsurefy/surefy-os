// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Check, Minus } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { ORG_ROLES } from '@surefy/contracts'
import { Section } from '@surefy/ui/components/Layout'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@surefy/ui/primitives/table'

import { buildCapabilityMatrix } from '../AccessSettings.utils'

const MATRIX = buildCapabilityMatrix()

/** What each built-in role can do, from the permission definitions the backend enforces. */
export default function CapabilityMatrix() {
  const t = useTranslations('settings.access.matrix')

  return (
    <Section title={t('title')} description={t('description')}>
      <div className="overflow-x-auto">
        <Table>
          <caption className="sr-only">{t('caption')}</caption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{t('capability')}</TableHead>
              {ORG_ROLES.map((role) => (
                <TableHead key={role} scope="col" className="text-center">
                  {t(`roles.${role}`)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {MATRIX.map(({ group, rows }) => (
              <GroupRows key={group} group={group} rows={rows} />
            ))}
          </TableBody>
        </Table>
      </div>
    </Section>
  )
}

function GroupRows({
  group,
  rows,
}: Readonly<{ group: string; rows: ReturnType<typeof buildCapabilityMatrix>[number]['rows'] }>) {
  const t = useTranslations('settings.access.matrix')
  return (
    <>
      <TableRow className="bg-surface-2">
        <TableCell colSpan={ORG_ROLES.length + 1} className="text-label font-medium">
          {t(`groups.${group}`)}
        </TableCell>
      </TableRow>
      {rows.map((row) => (
        <TableRow key={row.key}>
          <TableCell>{t(`permissions.${row.key}`)}</TableCell>
          {ORG_ROLES.map((role) => (
            <TableCell key={role} className="text-center">
              {row.allowedByRole[role] ? (
                <>
                  <Check aria-hidden className="text-success mx-auto size-4" />
                  <span className="sr-only">{t('allowed')}</span>
                </>
              ) : (
                <>
                  <Minus aria-hidden className="text-muted-foreground mx-auto size-4" />
                  <span className="sr-only">{t('notAllowed')}</span>
                </>
              )}
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  )
}
