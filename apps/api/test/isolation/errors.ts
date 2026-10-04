// SPDX-License-Identifier: AGPL-3.0-only
/** Thrown by the isolation helpers with every finding at once, so a report shows the whole leak. */
export class IsolationError extends Error {
  readonly findings: readonly string[]

  constructor(subject: string, findings: readonly string[]) {
    super(`${subject}: ${findings.length} isolation finding(s)\n- ${findings.join('\n- ')}`)
    this.name = 'IsolationError'
    this.findings = findings
  }
}

/** Throws when there is anything to report. */
export function assertNoFindings(subject: string, findings: readonly string[]): void {
  if (findings.length > 0) throw new IsolationError(subject, findings)
}
