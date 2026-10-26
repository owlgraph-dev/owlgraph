---
status: accepted
date: 2026-10-11
---

# 0012. A plugin keeps its state in the host's seams

## Context

The first plugin, Nextcloud, needed to remember things: which folder a
collection mirrors, a share's password, a person's connection to their own
account, its own settings. A plugin with tables and migrations of its own
would tie the core's schema history to every plugin, and make removing a
plugin a data migration.

## Decision

A plugin keeps no tables of its own and ships no migrations. What it stores
goes through the seams the core's plugin host offers: a node's record of its
source (`source_ref`), shaped by the plugin; its settings under its own key;
credentials sealed at rest for the node or the person they belong to; a
person's connection to the plugin's service; and the data its blocks need,
resolved for the viewer before a page renders. The core never names a
plugin, and a plugin reaches the core only through an allowlist; a script
checks both directions.

## Consequences

- Adding or removing a plugin changes no schema. A removed plugin's blocks
  become unknown blocks and come back if it returns.
- The seams carry the plugin's data with the core's guarantees: sealed
  secrets, viewer-scoped reads, backups that include them.
- A plugin needing a kind of state the seams cannot hold is a change to the
  host, made for every plugin.

## Alternatives considered

- **Plugin tables and migrations**: they make the schema depend on which
  plugins are installed, and a plugin's departure a migration.

See [plugins.md](../architecture/plugins.md).
