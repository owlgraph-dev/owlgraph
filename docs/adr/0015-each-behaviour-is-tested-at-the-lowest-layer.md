---
status: accepted
date: 2026-10-22
---

# 0015. Each behaviour is tested at the lowest layer that can observe it

## Context

Most of owlgraph's tests had grown as end-to-end tests in a browser — close
to 700 of them, slow and the main source of flakiness — including many that
checked a rule a database query or a function could check directly. A
browser test cannot tell a failed rule from a slow page, and one shared
database and server made tests wait on each other.

## Decision

A behaviour is tested at the **lowest layer that can observe it**: a unit
test for logic, an integration test against a real Postgres for queries and
permissions, an HTTP test on the built handler for a route's contract, a
component test in a browser for one component, and an end-to-end test only
for what only a whole browser session shows. A dozen journeys walk the main
flows across pages and roles. End-to-end runs get a database and a server
per worker. There is no pixel-comparison harness: layout is asserted from
measured boxes and computed styles.

## Consequences

- The end-to-end suite is less than half its former size, and a failure
  points at the layer that broke.
- Writing a test starts with choosing its layer
  ([testing.md](../guides/testing.md#choosing-a-layer)); a test a lower layer
  could hold belongs there.
- A visual regression that boxes and styles do not show can pass the suite.

## Alternatives considered

- **Mostly end-to-end**: what the suite was, slow and flaky.
- **Pixel snapshots**: brittle across fonts, platforms and content, and
  costly to maintain for what they catch.

See [testing.md](../guides/testing.md).
