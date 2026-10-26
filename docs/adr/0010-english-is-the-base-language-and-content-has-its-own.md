---
status: accepted
date: 2026-10-04
---

# 0010. English is the base language, and content has a language of its own

## Context

owlgraph's interface was written German-first, and the schema's labels — a
property's name, a class's description — were single strings in whatever
language their author used. A site can be read and written in several
languages, by people who do not share one, and agents read it through MCP
with no browser language at all.

## Decision

- **English is the base locale**: the interface's fallback, the language a
  schema label must have, and what MCP, GraphQL and a signed-out reader get
  when they ask for none.
- **The interface language and the content language are separate.** The
  interface speaks the user's chosen language, else the request's. A node's
  content language is stored with the node, decides its `lang`, its search
  stemming and the language its query output is written in, and never
  follows the reader's interface.
- **Schema labels are localized text**: one string per language, resolved by
  one function on the server before anything leaves it. A label is never an
  identifier; identity stays in slugs and ids.

## Consequences

- A German reader sees the German interface on a page written in English, and
  the page stays English.
- Every surface that shows a label resolves it for its request, so client
  code never handles the per-language map, except where labels are edited.
- Adding a language is a translation of the interface's messages and of the
  seeded labels, not a code change.

## Alternatives considered

- **One language per site**: it fits neither mixed teams nor agents.
- **Content that follows the interface**: a page has one language it is
  written in, and translating it is a separate page, not a setting.

See [Languages](../architecture/languages.md).
