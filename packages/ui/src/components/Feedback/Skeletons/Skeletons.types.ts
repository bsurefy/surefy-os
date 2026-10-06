// SPDX-License-Identifier: AGPL-3.0-only
export interface SkeletonTextProps {
  /** Default 3. */
  lines?: number
  className?: string
}

export interface SkeletonCardProps {
  /** Text lines under the title. Default 2. */
  lines?: number
  className?: string
}

export interface SkeletonRowsProps {
  /** Default 5. */
  rows?: number
  /** A 28px circle or tile at the start of each row (avatar, icon). */
  hasLeading?: boolean
  /** Text bars per row: 1 (title) or 2 (title and caption). Default 1. */
  lines?: 1 | 2
  /** Row height class. Default `h-11`. */
  rowClassName?: string
  className?: string
}

export interface SkeletonFormProps {
  /** Default 3. */
  fields?: number
  /** Default 1. */
  columns?: 1 | 2
  /** Draw the card frame around the fields. Default true. */
  hasFrame?: boolean
  className?: string
}

export interface SkeletonStatProps {
  /** Matches the stat card sizes. Default `md`. */
  size?: 'sm' | 'md'
  className?: string
}
