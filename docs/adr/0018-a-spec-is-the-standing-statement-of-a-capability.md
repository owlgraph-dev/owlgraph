---
status: proposed
date: 2026-11-17
---

# 0018. A spec is the standing statement of what a capability must do

## Context

A spec in `docs/features/` was written for a piece of planned work, and once
that work was implemented it was history. The gate, meanwhile, grows by
acceptance tests derived from a spec's acceptance criteria
([decision 0017](0017-the-gate-runs-unit-integration-and-journeys.md)). A test
that gates every change needs criteria that stay true for as long as it runs,
so the spec it came from cannot be history.

With one spec per piece of work, what a capability must do is also spread over
every spec that ever touched it. owlgraph was built that way before it had
specs: twelve plans describe the query block, and none of them is current.
`architecture/` says how each capability is built, but not which of its
behaviours are promises and which are how the code happens to work.

## Decision

A spec states what one capability must do, for as long as the capability
exists. A capability is something a person who uses owlgraph would name:
visibility and namespaces, search, share links.

- **A change to a capability edits its spec**, in the pull request that makes
  the change. The spec goes back to `in-progress` and returns to
  `implemented`; its history is the repository's.
- **A new capability gets a new spec** and the next number. A number
  identifies a spec and says nothing about order or age.
- **`superseded` is for a capability that is replaced**, not for one that
  changed.
- **Acceptance criteria are numbered, and a number is never reused.** A
  criterion that is dropped leaves a gap. The tests that prove a criterion
  carry its id in their name, as `NNN.n`: `002.5` is criterion 5 of spec 002.
- **A spec stays lean.** It holds the problem, the scope, the non-goals and
  the criteria, as outcomes someone can observe. How it is built stays in
  `architecture/`, why in `adr/`. *Implementation notes* keep only the
  deviations that still hold.
- **Capabilities that exist get their spec after the fact**, written from the
  architecture pages and the tests, starting with the ones where a regression
  is a security or data-loss fault.

## Consequences

- There is one place that says what a capability promises, and a failing
  acceptance test names the promise that broke.
- A change that alters behaviour on purpose shows up as a changed criterion,
  in the same diff as the code and the test.
- The spec, the architecture page and the tests of a capability have to move
  together. The change that implements a spec already updates `architecture/`
  and `guides/`; it now updates the criteria it changes as well.
- Finding a criterion's tests is a search for its id. Nothing checks yet that
  every criterion has a test, or that every id a test names exists.
- A spec written after the fact starts without that mapping. Until its
  criteria are matched to tests it says what is wanted, not what is proven.
- The README's description of a spec's life, and the spec template, change to
  match.

## Alternatives considered

- **A spec per piece of work, history once implemented**: what the README
  described. Simple to write, but the criteria a gate test rests on go stale
  with the next change, and no single file says what a capability must do.
- **Two kinds of file, a standing spec and a change proposal against it**: the
  proposal would keep each change's reasoning apart. Its reasoning already has
  homes, the pull request and, where a decision is taken, a record; a second
  kind of file is more to keep true than one person and a few agents need.
- **A list of behaviours beside the code of each feature**: closest to the
  tests, but a second home for what the spec's criteria already say, and
  organised by folder where a capability often crosses several.
- **The criteria on the architecture pages**: one file fewer, but it mixes
  what must be true with how it is built, and a page that describes the code
  changes for reasons that leave the promise untouched.
