# Changelog

All notable changes to SurefyOS Community are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project follows
[Semantic Versioning](https://semver.org/); versions before 1.0.0 may change between releases.

## [0.1.0] - 2026-10-07

First release: a self-hostable AI workspace where one organization connects its own model keys, chats
with them, builds a knowledge base and sees what it spends.

### Added

- **Workspace app** (`apps/workspace`): app shell with navigation, notifications and profile; light and
  dark themes; translations; every MVP screen on the real API.
- **Sign-in and setup**: sign in, sign up, email verification, two-factor authentication, password reset
  and a first-run setup wizard (organization, owner, first AI model, invitations).
- **Organization, members and teams**: invitations, teams, roles, effective access, and a single
  organization per Community install.
- **Settings**: general, members, teams, roles and access, data and privacy (export and delete the
  organization), security (two-factor requirement, session length), notifications and profile.
- **Vault**: provider keys with a required connection test, rotate and revoke, local models, model
  access and fallback.
- **Chat**: streaming replies with stop and continue, citations and sources, model picker, knowledge
  scope, attachments, private chats, folders, pinned chats, search and recently deleted chats with undo.
- **Knowledge**: knowledge bases built from files and web links, document parsing and OCR, test search,
  access control and settings.
- **Insights**: usage and cost overview with date range and filters, cost by team, person and model,
  tokens over time and CSV export.
- **Audit log**: viewer for security and administration events, with filters.
- **API** (`apps/api`): Fastify server and background worker with health checks, authentication and
  sessions, tenant isolation checked by a generated test suite, audit log, data control and maintenance
  jobs, email through a configurable mail provider.
- **ML service** (`apps/ml`): internal FastAPI service for document parsing and OCR, with a typed client
  generated from its OpenAPI description.
- **Design system** (`packages/ui`): tokens, theme, type scale and the component set used by every
  screen.
- **Shared packages**: `contracts`, `web-core`, `ml-client` and `config`.
- **Self-hosting** (`infra`): production images for the workspace, API, worker and ML service,
  `compose.selfhost.yml`, `install.sh`, `backup.sh` and the self-hosting guide (install, upgrade,
  backup and restore, connecting a local model server).
- **Project files**: AGPL-3.0 license, contributor license agreement check, contributing guide, security
  policy and trademark policy.

### Changed

- Self-host ports are configurable and the self-host stack serves plain HTTP by default.
- Settings sections are grouped under Operate; the organization switcher moved to the user menu.
- Dates are shown in the browser's time zone, with UTC as the default.

[0.1.0]: https://github.com/bsurefy/surefy-os/releases/tag/v0.1.0
