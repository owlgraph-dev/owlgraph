---
status: implemented
issue:
adrs: ['0002', '0004']
updated: 2026-11-17
---

# 002. Visibility and namespaces

## Problem

One installation holds content for different audiences: some for everyone,
some for the people who sign in, some for a chosen few. Whoever runs it needs
to say that once for a whole part of the site, without setting it node by
node, and still keep a single page closer than the rest. A reader must never
learn of content they may not read, by any way in.

## Scope

- **Three levels.** A node is *public* (anyone), *internal* (anyone signed in)
  or *restricted* (chosen people).
- **Namespaces carry the default.** Every node belongs to one namespace. The
  namespace's access level is the visibility of every node in it that has
  none of its own, and a change to it applies to those nodes at once.
- **A node can be closer than its namespace, never more open.**
- **Restricted has two audiences.** A node that inherits a restricted
  namespace is for that namespace's members. A node set to restricted by
  itself is for the people it is shared with. Its owner and admins always
  reach it.
- **Whoever is trusted to read a restricted node may also change it**, within
  what their role allows.
- **Addresses.** A node's address is its namespace's prefix and its slug; the
  default namespace has no prefix. Renaming or moving a node changes its
  address, and links between nodes keep working.
- **Managing namespaces.** An admin creates, renames and deletes namespaces,
  sets their access level and chooses the members of a restricted one.
- **A new installation is closed** until an admin opens it.

## Non-goals

- Opening one node beyond its namespace. That is a share link's job, and a
  spec of its own.
- Read-only access to a restricted node.
- Groups as members of a namespace; members are users.
- Handing a node's ownership to someone else. Until that exists, an owner who
  is removed from a namespace keeps their own nodes.
- Redirects from an old address after a rename or a move.
- Roles that differ from one namespace to the next.

## Acceptance criteria

Who may read:

1. An anonymous visitor can read a public node and no other.
2. A signed-in user can read every public and every internal node.
3. A restricted node that inherits its namespace can be read by that
   namespace's members, its owner and admins, and by no one else.
4. A node set to restricted by itself can be read by the users it is shared
   with, its owner and admins. Membership of its namespace alone does not
   open it, and being shared one node opens no other.
5. A node the asker may not read is answered as not found, exactly as a node
   that does not exist. The one exception: a signed-out visitor to an
   internal node is sent to sign in.
6. The answer is the same whichever way the node is asked for: its address,
   the API, search, the graph, a query block, an agent's tool, its file or
   its images. Lists leave out what the viewer may not read, and their counts
   do too.

Inheriting and narrowing:

7. A node with no visibility of its own has its namespace's access level.
   Changing that level changes who can read the node, without touching it.
8. A node cannot be set more open than its namespace. A node asked to be
   public keeps no setting of its own and goes on inheriting.
9. Lowering a namespace's access level, or moving a node into a closer
   namespace, narrows every setting that would now be too open, and never
   fails because of one.
10. Before an admin opens a namespace wider, the settings say how many nodes
    inherit it.
11. On a new installation an anonymous visitor finds no content, until an
    admin makes the default namespace public.

Who may change:

12. A user with the viewer role can change no node. An editor can change any
    page or collection they may read. A document can be changed only by its
    owner or an admin.
13. Creating a node in a restricted namespace, or moving one into it, needs
    membership of it or the admin role.
14. Only a user who may manage namespaces can create, rename or delete one,
    set its access level or change its members.
15. A namespace a viewer cannot reach is not offered to them anywhere and is
    not in the list of namespaces their browser receives.

Addresses:

16. A node in the default namespace is at `/<slug>`, any other at
    `/<namespace>/<slug>`. Two nodes may share a slug in different
    namespaces, not in the same one.
17. After a rename or a move, the old address is not found, and a link to the
    node from another page leads to its new address.
18. A slug or a namespace name that would hide one of the app's own
    addresses is refused. So is a namespace name that equals the slug of a
    node at the root, and the other way round.
19. Deleting a namespace deletes none of its nodes: they move to the default
    namespace, a slug that is taken there gets a suffix, and the default
    namespace itself cannot be deleted.

## Affected components

- [Authorization and visibility](../architecture/authorization.md): the two
  checks, namespaces as a live default, membership, what a page embeds.
- [Routing](../architecture/routing.md): namespaces, slugs, reserved words.
- [Settings](../architecture/settings.md): the Namespaces section.
- [Search](../architecture/search.md), [graph view](../architecture/graph-view.md),
  [dynamic rendering](../architecture/dynamic-rendering.md) and
  [MCP](../architecture/mcp.md): each lists for its viewer.
- [Documents](../architecture/documents.md) and [media](../architecture/media.md):
  a file's bytes follow its node.

## Decisions and constraints

- **Checked on the server, for the person asking**
  ([decision 0002](../adr/0002-authorization-is-server-enforced-and-viewer-scoped.md)).
  What the interface hides is never the check, and an embedded query runs as
  its reader, not as its author.
- **No setting means inherit**
  ([decision 0004](../adr/0004-null-means-inherit.md)). A node is public only
  by inheriting a public namespace, so closing the namespace closes it.
- **One rule for every node type.** Pages, documents and collections differ
  only in who may change them.
- **Deleting a namespace can open its content**, when the default namespace
  is more open than the one deleted. The deletion does not choose for the
  admin.
- **An address is not an identity.** Nodes refer to each other by id, and an
  old address is never redirected.

## Open questions

None blocks the work.

- Should a node's ownership be transferable, so that removing a member can
  remove all of their access?
- Should deleting a namespace warn when its content would become more open?
- Should the settings also say how many nodes a namespace closes, before an
  admin narrows it?

## Implementation notes

- Written after the fact, from the architecture pages, then checked against
  the code. Every criterion but 002.10 has an acceptance test that passes, in
  `tests/acceptance/002-visibility-and-namespaces/`. Where the code does not
  do what a criterion says, the case is pinned there as a known bug and not
  fixed, as the notes below say.
- 002.4 holds for a collection with no one to share it with: a collection has
  no share list, so one set to restricted by itself is its owner's and
  admins' alone.
- 002.5 does not hold in five cases, each pinned:
  - a signed-out visitor to a restricted document is sent to sign in;
  - the not-found answer for a page or document the asker may not read
    carries other words than a missing address's ("Page not found" for "Not
    found"), in the page's data, not in what it shows;
  - the edit address sends an editor who may not read the node to the front
    page, where a missing address is not found;
  - a write to a page or document the caller may not read is answered as
    forbidden, where a write to a missing one is not found, and so is a
    signed-out caller's write to a document's file;
  - an agent's link to a page its user may not read is made, and with no
    label of its own takes the page's title.
- 002.9 does not hold when a namespace is deleted while the default
  namespace is closer than it: its nodes move with their settings as they
  were. Pinned.
- 002.10 has no acceptance test: only a browser shows it, and the gate runs
  no component test. The namespace journey sees the notice, and a component
  test holds it beside the silence when a namespace is narrowed.
- 002.15 does not hold for a link: a page's link to a node in a restricted
  namespace carries that namespace's slug in its address, for every reader.
  Pinned. The address of a node the reader may not read, in a namespace they
  can reach, shows the same way; no criterion covers that.
- 002.18 does not hold when a namespace is deleted while one of its nodes is
  named as another namespace: the node arrives at the root under that name.
  Pinned.
