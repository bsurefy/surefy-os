# Contributing to SurefyOS

Thank you for helping. This guide explains how to propose a change and what every pull request needs.

## Before you start

- For anything larger than a small fix, open an issue first so we can agree on the approach.
- Security problems are never reported in public issues: see [SECURITY.md](./SECURITY.md).
- Be respectful and constructive in issues, pull requests and reviews.

## Contributor License Agreement

Every outside contribution needs a signed [Contributor License Agreement](./CLA.md). SurefyOS Community is AGPL-licensed, and BSurefy also ships it together with commercially licensed Enterprise and Cloud features, so BSurefy needs the right to use contributions under both.

Signing takes one comment: when you open your first pull request, a bot asks you to sign, and you reply with the sentence it gives you. You sign once, and it covers all your later contributions.

## Workflow

1. Fork the repository and create a branch from `develop`: `feature/<scope>-<short-desc>` or `fix/<scope>-<short-desc>`, lowercase, for example `fix/api-rate-limit-headers`.
2. Make your change, with tests.
3. Use [Conventional Commits](https://www.conventionalcommits.org/): `<type>(<scope>): <subject>`, for example `fix(vault): reject expired provider keys`. Types: `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `build`, `ci`, `chore`, `revert`.
4. Run the checks locally:

   ```bash
   pnpm install
   pnpm turbo run lint typecheck test
   pnpm format:check
   ```

5. Open a pull request into `develop`. Fill in the template: what changed, why, which edition it affects, and how you tested it. Pull requests are squash-merged, so the title becomes the commit message.

## Rules for code

- **License header.** Every new source file starts with `// SPDX-License-Identifier: AGPL-3.0-only` (or `# SPDX-License-Identifier: AGPL-3.0-only` in Python and shell files).
- **Dependencies** must have a license compatible with the AGPL (MIT, Apache-2.0, BSD, ISC, MPL-2.0 and similar).
- **Feature gates, not edition checks.** Code that depends on the edition checks a feature key (`FEATURES` in `@surefy/contracts`), never the edition name.
- **No private code.** Enterprise and Cloud logic does not live in this repository; when a change needs it, add an extension point instead and say so in the pull request.
- Follow the patterns already in the code; [AGENTS.md](./AGENTS.md) lists the essential rules in short form.

## Questions

Open a discussion or an issue. We aim to answer within a few working days.
