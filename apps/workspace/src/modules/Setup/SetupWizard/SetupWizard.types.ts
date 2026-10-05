// SPDX-License-Identifier: AGPL-3.0-only
import type { SetupOrganization } from '../Setup.types'

export interface SetupWizardProps {
  /**
   * The organization of an Owner who is signed in while setup is unfinished (the browser was closed
   * after "Organization & owner"): the wizard picks up at the AI model step.
   */
  resume: SetupOrganization | null
}
