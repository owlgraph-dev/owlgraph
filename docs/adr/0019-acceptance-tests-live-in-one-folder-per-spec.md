---
status: accepted
date: 2026-11-17
---

# 0019. Acceptance tests live in one folder, a folder per spec

## Context

The gate grows by acceptance tests derived from a spec's acceptance criteria
([decision 0017](0017-the-gate-runs-unit-integration-and-journeys.md)), and a
test that proves a criterion carries its id
([decision 0018](0018-a-spec-is-the-standing-statement-of-a-capability.md)).
Every other test sits beside the module it covers.

Most of the suite was written alongside the implementation and asserts what
the code does. If acceptance tests are found among it by their names alone,
the set is a search result: it cannot be reviewed as a set, it grows by
renaming a test, and nothing says what such a test may reach into. A
capability also crosses features. Who may read a node is decided in one
feature and observed through a dozen, so a test that the answer is the same
whichever way a node is asked for has no module to sit beside.

## Decision

The acceptance tests of a spec live in `tests/acceptance/<NNN>-<name>/`, a
folder named as the spec's file. A plugin's spec has its folder in the plugin,
`src/lib/plugins/<id>/acceptance/<NNN>-<name>/`, since the core never names a
plugin.

- **Every test in such a folder names a criterion of that spec**, by starting
  its name with the criterion's id, and no test elsewhere carries one.
- **Only kinds the gate runs**: unit, database and HTTP tests, by their usual
  suffix and in their usual project, each at the lowest of those layers that
  can observe the criterion.
- **An acceptance test reaches a feature as an outsider does**: its entry
  points, its adapters, the built handler, the agents' server. The boundary
  check holds the folder to that.
- **One test per criterion**, more only where the criterion itself lists
  cases that need different harnesses, and a spec has at most twice as many
  tests as criteria. A pin of a known bug is not counted.
- **A criterion's test is an existing one moved**, when one states exactly its
  outcome, at the right layer and on its own. Otherwise it is written new. A
  test left behind keeps its name.
- **A criterion without a test says so** in the spec's implementation notes,
  in a list item that begins with its id.

`scripts/check-criteria.mjs`, part of `npm run check`, holds the ids, the
kinds, the limit, and that every criterion of an implemented spec has a test
that passes or its note.

## Consequences

- What is proven of a capability is one folder: it can be counted, and a
  change to it is a visible diff.
- A failing acceptance test names the promise that broke.
- These tests are not beside the code they exercise. Whoever changes a
  feature finds them by the criterion's id.
- An acceptance test can overlap a test beside a module. The older test is
  removed on purpose, in a change that says so, or kept where its failure
  says more precisely what broke.
- A criterion only a browser shows has no layer in the gate below the
  journeys, since the gate runs no component tests. Its place is a note that
  it is unproven there, until a spec needs a Playwright spec in its folder
  and the gate's lane is taught to run it.
- Decision 0018 said nothing checks that every criterion has a test or that
  every id a test names exists. This does.

## Alternatives considered

- **Beside the module, found by id**: no setup, and what the testing guide
  said until now. The set cannot be counted or bounded, and a criterion that
  crosses features has no home.
- **Beside the module, with a manifest per spec listing its tests**:
  countable, and the tests stay where they were. A second thing to keep true,
  and still no rule on what such a test may import.
- **A name pattern as a filter of the test run**: it gives a run of the
  acceptance tests, not a set to review.
- **A folder per layer**: one spec's proof would lie in three places.
- **Beside the spec, in `docs/features/`**: every glob, check and header rule
  assumes tests are under `src/` or `tests/`.

See [testing.md](../guides/testing.md#acceptance-tests).
