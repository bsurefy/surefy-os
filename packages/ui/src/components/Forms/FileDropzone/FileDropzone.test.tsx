// SPDX-License-Identifier: AGPL-3.0-only
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import FileUploadList from '../FileUploadList'
import { formatFileSize } from './checkFiles'
import FileDropzone from './FileDropzone'

const labels = { title: 'Drop files here or browse', hint: 'PDF or Markdown · up to 1 MB' }
const pdf = new File(['%PDF'], 'report.pdf', { type: 'application/pdf' })
const notes = new File(['# Notes'], 'notes.MD', { type: '' })
const image = new File(['png'], 'photo.png', { type: 'image/png' })
const large = new File([new Uint8Array(2_000_000)], 'big.pdf', { type: 'application/pdf' })

describe('FileDropzone', () => {
  it('checks type and size of picked files', async () => {
    const onFilesAccepted = vi.fn()
    const onFilesRejected = vi.fn()
    render(
      <FileDropzone
        labels={labels}
        accept={['application/pdf', '.md']}
        maxSize={1_000_000}
        onFilesAccepted={onFilesAccepted}
        onFilesRejected={onFilesRejected}
      />,
    )
    const input = screen.getByLabelText('Drop files here or browse')
    expect(input).toHaveAccessibleDescription('PDF or Markdown · up to 1 MB')
    await userEvent.upload(input, [pdf, notes, image, large], { applyAccept: false })
    expect(onFilesAccepted).toHaveBeenCalledWith([pdf, notes])
    expect(onFilesRejected).toHaveBeenCalledWith([
      { file: image, reason: 'type' },
      { file: large, reason: 'size' },
    ])
  })

  it('accepts dropped files', () => {
    const onFilesAccepted = vi.fn()
    render(<FileDropzone labels={labels} onFilesAccepted={onFilesAccepted} isMultiple={false} />)
    fireEvent.drop(screen.getByText('Drop files here or browse'), {
      dataTransfer: { files: [pdf, image] },
    })
    expect(onFilesAccepted).toHaveBeenCalledWith([pdf])
  })

  it('formats sizes in the locale', () => {
    expect(formatFileSize(4_200_000, 'en-US')).toBe('4.2 MB')
    expect(formatFileSize(512, 'en-US')).toBe('512 bytes')
  })
})

describe('FileUploadList', () => {
  it('shows progress, errors and retry per file', async () => {
    const onRetry = vi.fn()
    const onRemove = vi.fn()
    render(
      <FileUploadList
        labels={{
          uploading: 'Uploading',
          done: 'Uploaded',
          retry: 'Retry',
          remove: (name) => `Remove ${name}`,
        }}
        onRetry={onRetry}
        onRemove={onRemove}
        items={[
          { id: 'a', name: 'report.pdf', size: '4.2 MB', status: 'uploading', progress: 40 },
          {
            id: 'b',
            name: 'notes.md',
            size: '2 KB',
            status: 'error',
            error: 'Upload failed. Try again',
          },
          { id: 'c', name: 'plan.pdf', size: '1 MB', status: 'done' },
        ]}
      />,
    )
    expect(screen.getByRole('progressbar', { name: 'Uploading report.pdf' })).toBeInTheDocument()
    expect(screen.getByText('Uploaded')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Retry' })).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledWith('b')
    await userEvent.click(screen.getByRole('button', { name: 'Remove plan.pdf' }))
    expect(onRemove).toHaveBeenCalledWith('c')
  })
})
