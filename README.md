# SurefyOS

SurefyOS is an open-source, self-hostable AI platform for teams. It brings chat, knowledge, agents, workflow automation and governance together in one workspace, and works with any AI provider or with models running on your own servers.

> **Status:** early development. The first release (chat, knowledge, model vault and usage insights on your own server) is in progress; there is no installable version yet.

## What it does

- **Chat** with any model, with history, folders, file uploads and answers that cite their sources.
- **Knowledge**: upload documents or add links, and get answers grounded in your own content.
- **Vault**: bring your own provider keys or connect local models; control which teams may use which models.
- **Insights**: usage and cost per person, team and model.
- **Governance** built in: organizations, teams, roles, an audit log, and data that stays on your server.

Agents, workflow automation, integrations and enterprise controls follow in later releases.

## Editions

| Edition        | For                                              | License                         |
| -------------- | ------------------------------------------------ | ------------------------------- |
| **Community**  | Self-hosting for one organization, free          | [AGPL-3.0-only](./LICENSE)      |
| **Enterprise** | Self-hosting with SSO, SCIM, advanced compliance | Commercial license from BSurefy |
| **Cloud**      | Hosted by BSurefy                                | Subscription                    |

This repository contains the Community edition. Enterprise and Cloud features are built on top of it and are not part of this repository.

## Repository layout

```text
apps/workspace     web app (Next.js)
apps/api           API server and background worker (Fastify)
apps/ml            document parsing and other ML tasks (Python, internal only)
packages/          shared libraries: contracts, ui, web-core, ml-client, config
infra/             Docker and self-host files
```

## Development

Requirements: Node.js 24, pnpm 12 (through Corepack), Docker, and uv for the Python service.

```bash
corepack enable
pnpm install
pnpm turbo run lint typecheck test
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the workflow and rules.

## Security

Please report vulnerabilities privately, as described in [SECURITY.md](./SECURITY.md).

## License and trademarks

SurefyOS Community is licensed under the [GNU Affero General Public License v3.0 only](./LICENSE). If you run a modified version as a network service, you must offer its source code to its users.

"Surefy" is a registered trademark of BSurefy, and "SurefyOS" is its product name. The license covers the code, not the names or logos; see [TRADEMARKS.md](./TRADEMARKS.md).

Copyright © 2026 BSurefy.
