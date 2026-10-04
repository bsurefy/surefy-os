// SPDX-License-Identifier: AGPL-3.0-only
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import FeatureGateCard from './FeatureGateCard'

const copy = {
  title: 'Single sign-on is part of SurefyOS Enterprise',
  description: 'Let people sign in with your identity provider.',
  editionLabel: 'Enterprise',
}

describe('FeatureGateCard', () => {
  it('names the feature, the edition and the actions', () => {
    render(
      <FeatureGateCard {...copy} actions={<a href="/settings/license">Enter license key</a>} />,
    )

    expect(screen.getByRole('heading', { level: 2, name: copy.title })).toBeInTheDocument()
    expect(screen.getByText('Enterprise')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Enter license key' })).toBeInTheDocument()
  })

  it('tells people who cannot act whom to ask', () => {
    render(<FeatureGateCard {...copy} note="Ask an owner to upgrade" headingLevel={3} />)

    expect(screen.getByRole('heading', { level: 3 })).toBeInTheDocument()
    expect(screen.getByText('Ask an owner to upgrade')).toBeInTheDocument()
  })

  it('keeps the preview out of reach: inert and hidden from assistive tech', () => {
    render(
      <FeatureGateCard
        {...copy}
        previewLabel="Preview of Single sign-on"
        preview={<button type="button">Save SSO settings</button>}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Save SSO settings' })).not.toBeInTheDocument()
    const preview = document.querySelector('[data-slot="feature-gate-preview"]')
    expect(preview).toHaveAttribute('inert')
    expect(preview).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByText('Preview of Single sign-on')).toBeInTheDocument()
  })
})
