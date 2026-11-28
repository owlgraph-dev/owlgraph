---
status: accepted
date: 2026-11-25
---

# 0027. One rule says who may change a node, and every node has a share list

## Context

The core owns who may read and write a node
([decision 0020](0020-the-core-is-the-graph-and-a-body-comes-from-a-plugin.md)).
Reading is one rule for every node. Changing is not: an editor may change a
page or a collection they may read, but a document only its owner or an
admin may change, whatever its visibility
([authorization.md](../architecture/authorization.md)).

A node restricted by itself is read by the people it is shared with, and its
share list is a table of its type. Pages and documents have one. A
collection has none, so a collection restricted by itself is its owner's and
admins' alone.

The node type becomes a kind of body, and a node may have no body
([decision 0026](0026-a-node-has-at-most-one-body-named-by-its-kind.md)). The
rule for changing a node and its share list need a home that is no type's.

## Decision

- **One rule says who may change a node, whatever it holds.** A user with
  the viewer role changes no node; an editor changes every node they may
  read; an admin changes all. A restricted node is changed by the people who
  may read it. A document follows the rule like any other node.
- **Every node has a share list**, with a body or without. A node restricted
  by itself is read, and changed, by the people it is shared with, its owner
  and admins.
- **Both are the core's.** A kind of body brings no access rule of its own.

## Consequences

- An editor can change a document they may read: its metadata and its file.
  Until now only its owner or an admin could.
  [Spec 002](../features/002-visibility-and-spaces.md) changes its
  criterion 12 on purpose, under its number, and holds "one rule for every
  node type" without an exception.
- A document's owner can no longer keep it open to read and closed to
  change. Restricting it narrows both, since whoever reads a restricted node
  may change it.
- A collection, and a node without a body, can be shared with chosen people.
- A plugin can make its nodes neither stricter nor looser to change. What a
  kind needs beyond the rule is a change to the core, made for every kind.
- The API states one rule for every node
  ([spec 004](../features/004-headless-graph-backend.md)).
- The share lists of pages and documents become one, in a migration of
  instances that hold data
  ([decision 0001](0001-migrations-are-immutable-and-forward-only.md)).

## Alternatives considered

- **A kind of body may ask for the stricter rule**: documents would stay as
  they are, the rule declared by the kind and checked by the core. But who
  may change a node would depend on what it holds, which decision 0020
  separates.
- **A setting of the node**: its owner chooses between the two rules. A new
  setting, and one more thing a reader of the rules has to know.
- **A share list only where a kind asks for one**: as today. A node without
  a body restricted by itself would be its owner's and admins' alone.
