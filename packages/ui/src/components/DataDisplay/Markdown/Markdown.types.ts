// SPDX-License-Identifier: AGPL-3.0-only
export interface MarkdownProps {
  /** Markdown from an AI answer, a knowledge document or a description. Raw HTML is not rendered. */
  children: string
  /** Labels of the copy button on code blocks. */
  codeLabels: { copy: string; copied: string }
  /** Level of a `#` heading; deeper headings follow. Default 3, so content never adds a page h1. */
  topHeadingLevel?: 2 | 3 | 4
  className?: string
}
