# owlgraph documentation

How owlgraph works, how to work with it, why it is the way it is and what is
planned — grouped below by what you want to do. The project's front page is
the [README](../README.md); how to contribute is in
[CONTRIBUTING.md](../CONTRIBUTING.md).

The pages live in four folders:

- [`architecture/`](architecture/) — how the system is, one page per concept;
- [`guides/`](guides/) — how to run, test and extend it;
- [`adr/`](adr/) — why it is that way, one record per decision;
- [`features/`](features/) — what is planned, one spec per feature.

[How these docs are kept](#how-these-docs-are-kept) is at the end.

## Get an overview

- [Architecture](architecture/overview.md) — the stack, the node model, the
  editor and the published page, the code layout and its boundary rules, the
  content security policy.
- [A request, from address to page](architecture/request-lifecycle.md) — one
  page request followed through the hook, the route, the access check, the
  render and the browser.
- [Glossary](glossary.md) — the words that mean something particular here,
  or more than one thing, and a legend of the CSS names page content carries.

## Run owlgraph

- [Deployment](guides/deployment.md) — the self-contained Compose stack:
  first run, production behind a reverse proxy, and the offer of the source
  code.
- [Backup and restore](guides/backup.md) — backing up the database, restoring
  it, and proving a backup works before you need it.
- [Upgrading](guides/upgrading.md) — bringing an installation to a newer
  release, across the baseline too, the search text, and going back.
- [Migrations](architecture/migrations.md) — forward-only schema changes, how
  they are applied, and the generated schema snapshot.
- [Logging](architecture/logging.md) — structured logs: the event catalogue,
  levels and fields, redaction, the audit subset, retention.

## Understand the content model

- [Semantic layer](architecture/semantic-layer.md) — classes, properties and
  relationships: what a node is, what it carries, how it relates.
- [Blocks](architecture/blocks/overview.md) — what pages are made of: the
  block kinds and their names, their anatomy, the capabilities they share and
  how those cascade across screen sizes, page layout, quick links and
  embedded nodes.
- [Dynamic rendering](architecture/dynamic-rendering.md) — query blocks,
  templates, and the GraphQL API they run on.
- [Documents](architecture/documents.md) — uploaded files and external links
  as nodes: sources, serving, search.
- [Media](architecture/media.md) — uploaded images: what is stored, who is
  served what, and the copies smaller screens get.
- [Routing](architecture/routing.md) — how an address finds its node:
  namespaces, slugs, reserved words; the API's one error body.

## Control access

- [Authorization and visibility](architecture/authorization.md) — roles,
  visibility per node and namespace, viewer-scoping, sealed credentials,
  requests to other services.
- [Settings](architecture/settings.md) — Settings: which sections exist and
  who sees them.

## Find and explore

- [Search](architecture/search.md) — the search overlay and the search page:
  matching, filters, results.
- [Graph view](architecture/graph-view.md) — the graph of nodes and their
  links, globally and beside a page.

## Shape the look and the language

- [Theming](architecture/theming.md) — colour schemes, the site theme, dark
  mode, and the colour reasoning behind them.
- [Typography](architecture/typography.md) — the type scale, paragraph styles
  and how sizes are stored.
- [Custom styles](architecture/custom-styles.md) — named styles and free CSS,
  kept to the content area.
- [Responsive behaviour](architecture/responsive.md) — how pages and the app
  fit a phone and a tablet.
- [Languages](architecture/languages.md) — the interface language and the
  content language, the site's languages, localized schema labels.

## Connect agents and other services

- [MCP](architecture/mcp.md) — the agents' server: its tools, writing a page
  as blocks, reading one.
- [Writing a plugin](guides/writing-a-plugin.md) — the files of a plugin, a
  block step by step with the Nextcloud plugin as the example, registering,
  checking and removing one.
- [Plugins](architecture/plugins.md) — the plugin seam: the Plugin Interface
  the licence exception refers to, the contract, the host, routes,
  connections and the boundaries both ways.
- [The Nextcloud plugin](architecture/nextcloud.md) — the plugin that ships
  with owlgraph: public shares and each person's own files as collections and
  documents, and the blocks that show them.

## Build the interface

- [Design system](architecture/design-system/overview.md) — the catalogue of
  primitives and each one's reference, tokens and focus rings, the UI
  patterns, the playground and the guardrails.
- [Building UI](guides/building-ui.md) — the procedure for a change to the
  interface: catalogue first, tokens only, the grammar to match, verifying it.
- [Editor](architecture/editor.md) — the editor's folders, its core, its edit
  session and its desktop and phone shells around that core.

## Change the code safely

- [Testing](guides/testing.md) — the test pyramid and which layer a test
  belongs in, the rules every test follows, the gate, the test databases,
  each layer's harness, the end-to-end servers, lanes, isolation and
  journeys, the CI contract.
- [Branches, pull requests and releases](guides/branches-and-releases.md) —
  how a change reaches `main`, how a release is cut and patched, and what
  that means for migrations.
- [AGENTS.md](../AGENTS.md) — the rules every change follows, for people and
  coding agents alike.

## Decisions and plans

- [Decision records](adr/) — why owlgraph is the way it is: the decisions an
  outsider would otherwise reopen, each with its context, its consequences and
  the alternatives weighed against it.
- [Feature specs](features/) — what is planned: the problem, the scope, what
  is left out on purpose, and how to tell it is done.

## How these docs are kept

- **The present, the past and the future have their own folders.**
  `architecture/` and `guides/` describe what is, in the present tense, and
  always match `main`: no process, no history, no changelog, no "used to".
  `adr/` records why. `features/` holds what is planned.
- **One home for each fact.** A page is linked, never copied. A design's
  reason is a paragraph on its page, which links the decision record; the
  record keeps the context the decision was taken in, the alternatives and
  the consequences. When and by whom — order, status, milestones — belongs in
  the issue tracker, not here.
- **Names.** File names are kebab-case. A decision record is
  `adr/NNNN-<decision>.md`, a spec `features/NNN-<feature>.md`, each numbered
  in its own sequence. A new page gets its line in this index.
- **Frontmatter.** A decision record and a spec start with YAML frontmatter,
  so that a reader or an agent can filter without reading the whole file:
  - a record: `status` (`proposed`, `accepted` or `superseded`), `date`, and
    `supersedes` or `superseded-by` where they apply;
  - a spec: `status` (`draft`, `ready`, `in-progress`, `implemented` or
    `superseded`), `issue`, `adrs` (the records it relies on) and `updated`.

  Each folder has its template: [a record's](adr/_template.md),
  [a spec's](features/_template.md).
- **An accepted decision record is not edited.** A decision that changes gets
  a new record that supersedes it; the old one changes only its status.
- **A spec's life.** It is written as a `draft` and handed over as `ready`.
  It says what and why, with its constraints; how is left to the
  implementation, which sets it `in-progress`, then `implemented`, and records
  every deviation under *Implementation notes*. The change that implements it
  updates `architecture/` and `guides/` to match. An implemented spec is
  history, and the next round of planning starts from its deviations. The
  implementation plan itself is not committed; its summary goes into the pull
  request.
- **Who writes what.** Planning writes the decision records and the specs.
  The implementation writes the code together with `architecture/` and
  `guides/`, and of a spec only its status and its implementation notes.
