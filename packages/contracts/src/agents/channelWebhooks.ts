// SPDX-License-Identifier: AGPL-3.0-only

// Where Slack and WhatsApp deliver their events (database/agents-and-runs.md §4): on the public
// API host, outside every organization path.
// POST /api/v1/channels/slack/events · GET and POST /api/v1/channels/whatsapp/webhook.
// - The event names the account (Slack `{team_id}/{bot_user_id}`, the WhatsApp phone number id),
//   which resolves the channel (`agent_channel_resolve_external`).
// - Slack signs every request with the install's Slack app signing secret (v0 HMAC of
//   `v0:{timestamp}:{body}`), no older than SLACK_SIGNATURE_MAX_AGE_SECONDS. WhatsApp signs with
//   the app secret of the organization's Meta app, kept in the connection
//   (`X-Hub-Signature-256: sha256=…`). A bad signature answers `401 AGENT_CHANNEL_SIGNATURE_INVALID`.
// - WhatsApp's set-up check (`GET` with `hub.verify_token`) needs the channel's verify token,
//   shown on the Publish tab with the webhook address; another token answers
//   `403 AGENT_CHANNEL_VERIFY_TOKEN_INVALID`.
// - Every other event answers `200` at once, also when it is ignored (an unknown account, a paused
//   channel, a repeat), so providers do not retry it. The answer arrives later as a reply.

export const SLACK_EVENTS_PATH = '/api/v1/channels/slack/events'
export const WHATSAPP_WEBHOOK_PATH = '/api/v1/channels/whatsapp/webhook'

export const SLACK_SIGNATURE_HEADER = 'x-slack-signature'
export const SLACK_TIMESTAMP_HEADER = 'x-slack-request-timestamp'
/** Older signed requests are refused: a captured request cannot be replayed later. */
export const SLACK_SIGNATURE_MAX_AGE_SECONDS = 300

export const WHATSAPP_SIGNATURE_HEADER = 'x-hub-signature-256'
/** `wv_` and a value tied to the channel. */
export const WHATSAPP_VERIFY_TOKEN_PREFIX = 'wv_'

/** The messages of a Slack thread or WhatsApp chat a run receives, the newest last. */
export const CHANNEL_HISTORY_MESSAGES_MAX = 20
/** How long a thread or chat is remembered after its last message. */
export const CHANNEL_HISTORY_DAYS = 7
