// SPDX-License-Identifier: AGPL-3.0-only
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import Markdown from './Markdown'

const codeLabels = { copy: 'Copy', copied: 'Copied' }

describe('Markdown', () => {
  it('never adds a page heading and opens links safely', () => {
    render(
      <Markdown codeLabels={codeLabels}>
        {'# Refund policy\n\n## Steps\n\nSee [the handbook](https://acme.com/handbook).'}
      </Markdown>,
    )
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Refund policy' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 4, name: 'Steps' })).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'the handbook' })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('skips raw HTML and unsafe links, renders tables and code blocks', () => {
    render(
      <Markdown codeLabels={codeLabels}>
        {[
          '<script>alert(1)</script>',
          '[click](javascript:alert(1))',
          '',
          '| Plan | Seats |',
          '| --- | --- |',
          '| Team | 20 |',
          '',
          '```json',
          '{ "ok": true }',
          '```',
        ].join('\n')}
      </Markdown>,
    )
    expect(document.querySelector('script')).toBeNull()
    expect(screen.getByText('click').closest('a')).not.toHaveAttribute(
      'href',
      'javascript:alert(1)',
    )
    expect(screen.getByRole('cell', { name: '20' })).toBeInTheDocument()
    expect(screen.getByText('json')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument()
  })
})
