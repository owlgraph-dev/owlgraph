---
status: accepted
date: 2026-11-16
---

# 0017. The gate runs the unit and integration tests and the journeys

## Context

The gate — `npm run gate`, and CI beside it — ran every test there is: unit,
integration, component, and the whole end-to-end suite, 338 browser tests in
two lanes. Its end-to-end part failed more often for timing than for a
fault. A pull request that changed nothing but the version failed three runs
in a row, each time on an editor spec while 158 others passed, and on a
different spec the third time. A gate that fails for nothing teaches people to
run it again until it is green, which is the opposite of what a gate is for,
and it made the gate the slow and uncertain step of every change.

Many of these tests were written alongside the implementation, by people and
coding agents alike, and assert what the code does rather than what was
wanted: they fail when a behaviour changes on purpose, and pass when it is
wrong in a way nobody wrote down. The specs (`docs/features/`) now state what
is wanted as acceptance criteria, which a test can be derived from.

## Decision

The gate runs the build, `npm run check`, the unit tests, the integration
tests (database and HTTP) and the journeys, the end-to-end tests of the golden
paths (`tests/e2e/journeys/`). CI runs the same. The component tests, the
other end-to-end specs and the branded lane are not part of it: they are tools
to run while working on what they cover and before a push, or all at once
with `npm run gate:full`.

What joins the gate from here on are acceptance tests derived from a spec's
acceptance criteria, each at the lowest layer that can observe it
([decision 0015](0015-each-behaviour-is-tested-at-the-lowest-layer.md)).

## Consequences

- The gate takes minutes, and a timing flake in an editor spec no longer
  blocks a change.
- A regression in the interface that only a component test or an end-to-end
  spec shows passes the gate, unless a journey walks through it. Whoever
  changes the interface runs the tests of what they change; the pull request
  template asks for it.
- Nothing runs the tests outside the gate on a schedule, so they can drift. One
  that fails when it is next run is fixed, or deleted when it only pinned down
  how the code happened to work.
- Decision 0015 holds: a test is still written at the lowest layer that can
  observe its behaviour. This decision only says which tests gate a change.
- The repository's rules require the gate's CI jobs by name, so a change to
  the jobs' names changes the rules too.

## Alternatives considered

- **Everything in the gate**: what it was, slow and failing for timing more
  than for faults.
- **The component tests in the gate too**: they are faster and steadier than
  end-to-end specs, and the layer decision 0015 gives a component's
  behaviour. Left out to keep the gate to the tests that guard the system as a
  whole, at the cost of the interface's coverage.
- **A scheduled run of everything**: it would catch drift without blocking a
  change. Not taken for now: the tests outside the gate are kept as tools.

See [testing.md](../guides/testing.md#running-tests).
