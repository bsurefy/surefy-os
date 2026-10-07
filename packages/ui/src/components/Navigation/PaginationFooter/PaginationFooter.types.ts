// SPDX-License-Identifier: AGPL-3.0-only
export interface PaginationFooterLabels {
  /** "1–50 of 4,812": the caller formats the range with its locale. */
  range: string
  previous: string
  next: string
  /** Label of the page-size select ("Rows per page"). */
  pageSize: string
}

export interface PaginationFooterProps {
  labels: PaginationFooterLabels
  hasPrevious: boolean
  hasNext: boolean
  onPrevious: () => void
  onNext: () => void
  /** Current page size and the allowed choices (25 / 50 / 100). */
  pageSize?: number
  pageSizes?: number[]
  onPageSizeChange?: (size: number) => void
  className?: string
}

export interface LoadMoreProps {
  /** "Load more". Translated text. */
  label: string
  onLoadMore: () => void
  isLoading?: boolean
  hasMore: boolean
  className?: string
}
