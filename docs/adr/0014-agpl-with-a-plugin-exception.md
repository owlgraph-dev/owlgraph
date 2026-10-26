---
status: accepted
date: 2026-10-20
---

# 0014. AGPL-3.0-only with a plugin exception

## Context

owlgraph is published as free software. It is a server application: most
people who use it never receive a copy, they use it over a network, so a
licence that only governs distribution would let a modified owlgraph run as a
service without its changes being shared. At the same time, plugins and
separate clients should be possible under licences their authors choose,
including proprietary ones, as long as they use owlgraph only through its
public interface.

## Decision

owlgraph is licensed under the **GNU AGPL, version 3 only**, with an
additional permission under its section 7, the **plugin exception**: a
plugin or a client that interacts with owlgraph only through the Plugin
Interface — the interfaces the documentation designates as public — may be
licensed as its authors choose. owlgraph itself, and anything that modifies
or patches it, stays under the AGPL. Every source file carries the licence
header, and the running app offers its source on its About page, as the
AGPL's section 13 asks.

## Consequences

- Whoever runs a modified owlgraph for others offers them its source.
- What the Plugin Interface is, is part of the licence's meaning: the
  documentation designates it, in general terms and as experimental for now,
  so it does not rule out where plugins come from or how they load.
- Contributions are accepted under the same terms.

## Alternatives considered

- **GPL**: a network service would not have to share its changes.
- **A permissive licence**: anyone could run a closed fork as a service.
- **AGPL without an exception**: every plugin would have to be AGPL too, which
  shuts out integrations whose authors cannot license them so.

See [`LICENSE`](../../LICENSE),
[`PLUGIN-EXCEPTION.md`](../../PLUGIN-EXCEPTION.md) and
[The Plugin Interface](../architecture/plugins.md#the-plugin-interface).
