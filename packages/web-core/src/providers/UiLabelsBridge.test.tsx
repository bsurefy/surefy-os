// SPDX-License-Identifier: AGPL-3.0-only
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it } from 'vitest'

import { useUiLabels } from '@surefy/ui/lib/labels'

import { UiLabelsBridge } from './UiLabelsBridge'
import common from '../../messages/en/common.json'
import validation from '../../messages/en/validation.json'

function Probe({ text }: Readonly<{ text: string }>) {
  const { close, translateMessage } = useUiLabels()
  return (
    <p>
      {close} | {translateMessage(text)}
    </p>
  )
}

describe('UiLabelsBridge', () => {
  it('fills ui labels from common and translates validation keys, leaving plain text alone', () => {
    const { rerender } = render(
      <NextIntlClientProvider locale="en" messages={{ common, validation }}>
        <UiLabelsBridge>
          <Probe text="issues.too_small" />
        </UiLabelsBridge>
      </NextIntlClientProvider>,
    )
    expect(screen.getByText(`${common.close} | ${validation.issues.too_small}`)).toBeInTheDocument()
    rerender(
      <NextIntlClientProvider locale="en" messages={{ common, validation }}>
        <UiLabelsBridge>
          <Probe text="Enter a team name" />
        </UiLabelsBridge>
      </NextIntlClientProvider>,
    )
    expect(screen.getByText(`${common.close} | Enter a team name`)).toBeInTheDocument()
  })
})
