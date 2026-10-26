# Contributing to owlgraph

Thank you for helping. This page is the short version; how the system works
is in [`docs/`](docs/), indexed in [docs/README.md](docs/README.md).

## Before you start

**Prerequisites:**

- **Node.js 22.15 or later** (`.nvmrc`; `npm` refuses an older one).
- **PostgreSQL 16**, reachable from your machine, with the `pgcrypto`
  extension available (any standard Postgres package or image has it). The
  Docker stack's database is not published to the host, so development needs
  a Postgres of its own.
- **For the tests:**
  - The gate resets a database of its own on the same server. By default
    that is `postgres://user:password@localhost:5432/owlgraph_test`: a role
    `user` with password `password` that may create databases and roles. To
    use another, set `DATABASE_URL` to a database whose name contains `test`.
  - Playwright's browser: `npx playwright install --with-deps chromium`.

  [docs/guides/testing.md](docs/guides/testing.md) has the details.
- **Network on install:** `npm ci` fetches packages from npm and, to compile
  the interface messages, two inlang plugins from the jsDelivr CDN.

**Set up:**

```bash
npm ci                  # also prepares SvelteKit's types and compiles the interface messages
cp .env.example .env    # set DATABASE_URL to your Postgres
npm run db:migrate      # creates the database if missing, then runs pending migrations
npm run create-admin -- you@example.com "Your Name"   # prompts for a password
npm run dev             # the app at http://localhost:5173
npm run mcp             # the MCP server at http://localhost:3030/mcp
```

**Before you start a change:**

- **Talk first about anything large.** Open an issue describing what you want
  to change and why before writing a big change; a small fix can go straight
  to a pull request.
- **Security problems** are reported privately — see [SECURITY.md](SECURITY.md).

## Making a change

- **A branch and a pull request per change.** Branch `feature/…` or `fix/…`
  from `main`. The pull request's title is a lowercase
  [Conventional Commit](https://www.conventionalcommits.org/), such as
  `feat: add subgraph export` or `fix: handle an empty class`; squash merging,
  which makes it the commit message, is recommended. Release branches, tags and how a fix reaches a release are
  in [docs/guides/branches-and-releases.md](docs/guides/branches-and-releases.md).
- **The gate is the definition of done.** `npm run gate` runs the build,
  `npm run check` (types, the architecture boundaries, the UI conventions,
  no stray `console`, the paths the docs and comments name, the licence headers), the unit, integration and component tests and every
  end-to-end lane against test databases it creates ([docs/guides/testing.md](docs/guides/testing.md)). It must be
  green before a pull request is merged; CI runs the same.
- **Follow the rules in [AGENTS.md](AGENTS.md)** — they apply to people as much
  as to coding agents: migrations are forward-only and never edited once
  applied, authorization is enforced on the server for the current viewer,
  what reaches HTML is sanitized, and the editor and the public page render
  the same.
- **UI work** follows [docs/architecture/design-system/overview.md](docs/architecture/design-system/overview.md) and its
  procedure, [docs/guides/building-ui.md](docs/guides/building-ui.md).
- **User-visible text** goes through the message catalogues (`messages/en.json`
  and `messages/de.json`, both), never hard-coded.
- **Docs describe what is and why**, not how it got there — no changelog in
  `docs/`.

## Licence and sign-off

owlgraph is licensed under the AGPL-3.0-only with the
[plugin exception](PLUGIN-EXCEPTION.md); a contribution is accepted under the
same terms.

- **Every source file starts with the licence header.** `npm run
  license-headers` adds it to a new file; `npm run check` and CI fail a file
  without it. The script never writes into a migration: a new one carries
  the header from its first commit, before it is applied, since an applied
  migration is never edited.
- **Sign off every commit** (`git commit -s`), certifying the
  [Developer Certificate of Origin 1.1](https://developercertificate.org/):
  that you wrote the change, or otherwise have the right to submit it under
  the project's licence. A check on the pull request asks for it, and
  `git rebase --signoff main` adds a missing one to every commit of the
  branch.
- **Third-party code or assets** (an icon, a snippet) are allowed when their
  licence is compatible with the AGPL; say where they come from in
  [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md). A new dependency's
  licence lands in `static/licenses.txt` through `npm run notices`, which CI
  checks is current.
- **Publishing checks.** `node scripts/check-publication.mjs` must stay
  green: no backups or generated files, secrets, personal paths or private
  addresses in what git tracks.
