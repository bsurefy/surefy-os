// SPDX-License-Identifier: AGPL-3.0-only

/** The wizard's screens in order. Safety and Start-with are V1 and later, so they have no screen yet. */
export const SETUP_STEP = {
  WELCOME: 'welcome',
  ORGANIZATION: 'organization',
  MODEL: 'model',
  READY: 'ready',
} as const
export type SetupWizardStep = (typeof SETUP_STEP)[keyof typeof SETUP_STEP]

export const SETUP_STEPS: readonly SetupWizardStep[] = [
  SETUP_STEP.WELCOME,
  SETUP_STEP.ORGANIZATION,
  SETUP_STEP.MODEL,
  SETUP_STEP.READY,
]

/** How long the slug must rest before the server is asked whether it is free. */
export const SLUG_CHECK_DELAY_MS = 400

/** Most addresses one invite request list accepts; each becomes its own request. */
export const INVITE_EMAILS_MAX = 50

/** The roles the Ready step offers; Owner is given only from Settings › Members. */
export const INVITE_ROLES = ['user', 'builder', 'admin'] as const

/** Shortest setup token the server accepts. */
export const SETUP_TOKEN_MIN_LENGTH = 16

/** Credentials shown on the model step. */
export const CONNECTED_MODELS_LIMIT = 20
