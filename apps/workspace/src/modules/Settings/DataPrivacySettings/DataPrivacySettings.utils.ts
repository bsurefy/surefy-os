// SPDX-License-Identifier: AGPL-3.0-only
import type { DataRequestDto, DataRequestStatus } from '@surefy/contracts'
import type { StatusTone } from '@surefy/ui/components/DataDisplay'

const STATUS_TONES: Record<DataRequestStatus, StatusTone> = {
  requested: 'info',
  preparing: 'info',
  ready: 'success',
  delivered: 'success',
  expired: 'neutral',
  failed: 'destructive',
  scheduled: 'warning',
  canceled: 'neutral',
}

export function getRequestTone(status: DataRequestStatus): StatusTone {
  return STATUS_TONES[status]
}

/** What the person can still do with an export. */
export function getExportActions(request: DataRequestDto): {
  canDownload: boolean
  canRetry: boolean
  canCancel: boolean
} {
  return {
    canDownload: request.status === 'ready' || request.status === 'delivered',
    canRetry: request.status === 'failed',
    canCancel: request.status === 'requested',
  }
}

/** The deletion that is waiting out its 30-day hold, if any. */
export function findScheduledDeletion(requests: DataRequestDto[]): DataRequestDto | undefined {
  return requests.find((request) => request.type === 'deletion' && request.status === 'scheduled')
}

/** Human size of an archive: MB with one decimal, GB above 1000 MB. */
export function formatMegabytes(bytes: number): number {
  return Math.round((bytes / 1_000_000) * 10) / 10
}
