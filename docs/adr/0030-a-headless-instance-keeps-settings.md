---
status: accepted
date: 2026-11-25
---

# 0030. A headless instance turns off the reader and the editor, and keeps Settings

## Context

A headless instance is one whose presentation is off, not a mode of its own
([decision 0020](0020-the-core-is-the-graph-and-a-body-comes-from-a-plugin.md)).
What the app shows falls into two groups
([overview.md](../architecture/overview.md),
[settings.md](../architecture/settings.md)):

- what readers and authors use: a node's address and its edit address, the
  home page, the search page, the graph view, the page a share link opens;
- what the people who run the instance use: sign-in, Settings and the About
  page.

A person makes their API token under Settings. Users, the site's settings
and each integration's settings are managed there and nowhere else. The
About page offers the source of the running version, which the licence asks
of every instance that serves users over a network
([decision 0014](0014-agpl-with-a-plugin-exception.md)).

## Decision

A headless instance turns off the reader and the editor: the addresses
readers and authors use answer not found. Sign-in, Settings and the About
page stay, as the instance's admin console. One setting of the instance's
configuration makes the switch.

- The schema and the spaces are managed through the API as well, under the
  rules Settings enforces.
- Users, the site's settings and integrations are managed in Settings.
- The source of the running version is offered on the About page and named
  by the API.

## Consequences

- A headless instance still has a browser interface, for the people who run
  it. Its first client can work without an API for users or tokens.
- A person makes a token where they do today.
- The licence's offer of the source holds on a headless instance as on any
  other.
- The sections of Settings that only shape what readers see — navigation,
  the home page, branding, styles — have nothing to act on there.
- An instance with no browser interface at all is not offered.

## Alternatives considered

- **The API and the command line only**: every page of the app off. Users
  and tokens would need an API and commands of their own before a headless
  instance could be used at all.
- **Two switches**, one for the reader and the editor and one for Settings:
  an operator chooses, and both paths are built and tested for a choice few
  need.
