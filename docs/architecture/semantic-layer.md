# The semantic layer: properties, relationships, classes

Content in this system has one "kind" axis: the **class hierarchy**. It
unifies two notions — the structural node type
(page or document: which editor, view, routing dispatch and storage a node
gets) and the semantic class (work package, person, deliverable: what the
node *is about*) — into a single tree, modelled on the RDFS/OWL vocabulary
(class, subClassOf, property inheritance).

The semantic layer is built from three primitives:

| Primitive | What it is | Storage |
|---|---|---|
| **Property** | An attribute of a node, always `group:name` (e.g. `core:status`) | `property_groups`, `property_definitions`, values in `node_properties` |
| **Relationship** | A typed edge between two nodes | `relationship_types`, `edges.relationship_type`, `edge_properties` |
| **Class** | What kinds of thing the node is — positions in the class hierarchy, each implying a property group | `node_classes` (a single-parent tree), `node_class_statements` |

Properties and relationships are documented where they are used
([dynamic-rendering.md](dynamic-rendering.md) for how queries read them);
this page is mostly about the third leg.

The **property catalogue** — the names a property condition or an annotation
may use — is two lists in one. Every registered definition
(`property_definitions`) is schema and is listed whole to whoever may read
the schema; a name in use without one comes only from the nodes the caller
may read. GraphQL's `propertyDefinitions`, the catalogue the MCP `schema` tool
appends and the editor's and the query builder's suggestions offer both; the
MCP `list_property_names` tool names the names in use on those nodes, each
with how many times it occurs on them. A name only content hidden from the
caller carries is neither named nor counted, as with
[tags](#querying-by-tag).

## The class hierarchy

```
L0   node                           the fixed abstract root
L1   page, document, collection     the node types — carry the machinery
L2+  invoice, work-package, …       domain classes — semantic, single-parent, any depth
```

Three level bands, with invariants the database enforces (not conventions):

- **L0 is `node`**, the single abstract root. It is never assigned to a
  node.
- **L1 are the node types** — `page`, `document` and `collection` (an
  ordered set of nodes, [Collections](#collections)). They carry the
  **machinery**: which editor, view, routing dispatch and storage shape
  (`pages`, `documents` or `collections` table) a node gets. They are core schema, created by migration: not admin-createable,
  not deletable, key and parent fixed. Their label, description, property
  group and overview page stay editable, because that is how the document
  type's metadata group is configured.
- **L2+ are domain classes** — purely semantic, admin-defined, each with
  exactly **one parent** (a node type or another domain class), to any
  depth. Nothing semantic ever sits at L1 and no machinery ever sits at
  L2+: a domain class's parent must be a type or a domain class.

### A node's classes

**A node has any number of classes** — each one a statement of its own in
`node_class_statements` — and **one with no class of its own has its L1
type's**: a plain page is a node of class `page`. Giving it classes
replaces that one, and taking its last one away
brings it back, so "unclassified" just means "exactly its node type, no
domain class below it". Neither ever deletes a property value or a
relationship: a class only decides which fields are offered. Everything
that reads a node's classes reads a set — the node header, a query's
conditions and results, the API, the agents' tools — and copes with an
empty one.

### Collections

A **collection** is an ordered set of nodes: pages, documents and
collections someone put in a sequence, or a folder another service holds,
mirrored through an integration ([plugins.md](plugins.md)). It is a node like
any other — classes (its L1 type, or domain classes below it), properties,
tags, an access level and a share list, a place in search, the graph and
queries — and is changed like every node: by any editor who may read it
([authorization.md](authorization.md#two-checks)).

Its row (`collections`) says where its members come from — its **membership
source**, derived, never stored as such:

- **curated** (no `plugin`): its editors choose the members and their
  order — made empty from the Create menu, arranged in its editor;
- **plugin** (a `plugin`): it mirrors a source that integration holds,
  and the integration's record of it (`source_ref`: a path, an id, what it
  last saw) is the integration's alone — never a credential, which is stored
  sealed apart ([authorization.md](authorization.md#secrets)). Its members are
  the nodes made from that source — an integration's block turns a file into
  a document and a member at once — and an editor's change to them is
  refused;
- a query's results, kept live, are a membership source the model reserves
  but nothing makes yet.

Spaces and classes structure the graph; a collection is a curated,
sequenced set across it — a reading list, a dossier, the parts of a
course — and a query derives a set from what nodes are. Reach for a
collection where the order and the choice are someone's.

**Its members** are `contains` relationships from the collection to each
member, each carrying the member's place as the `collection:position`
property (a whole number) and, when an editor gave it one, what the
collection calls it as `collection:label` — one text per language, which
every surface that shows the edge resolves for its reader (the collection's
page, `get_collection`, `get_relationships`, the graph). A member is in a
collection once. The relationship type, its property group (`collection`)
and the properties are ordinary schema rows — an admin sees, labels and
describes them like any other, but defines no other property in the group and
changes what none of them holds — made when the first member joins rather
than by a migration, so they return after an admin deletes the unused type
or a test run empties the catalog. A quick link never types an edge
`contains`: membership is the collection's own.

A curated collection's editor adds a member — any node they may read, a
collection included, found by its title across every space, or made
there under the title they searched for: a page, a collection or a document
in the collection's own space ([search.md](search.md#the-node-picker)) —
at the end, gives it a label, moves the members, takes one out (the node stays),
each a request of its own (`/api/collections/<id>/members`) that the editor
shows the answer of. A member moves by its handle — dragged, or with ↑ and ↓
while it has the focus (`SortableList`,
[design-system/overview.md](design-system/overview.md)) — or from its menu, which a finger
reaches more surely than a drag. What they rearrange is the order of the
members they may read, against the order they read: a rearrangement made
after someone else's change is refused rather than applied over it, and a
member they may not read keeps its slot. Every list of members — the
collection's page, its editor, `get_collection` — numbers the members its
reader may read from 1, so a gap never gives a hidden member away
([authorization.md](authorization.md#a-collections-members)).

**Collections nest**: a collection may be a member of another, never of
itself, at any depth. Adding one collection to another first walks up the
holder's ancestry — every collection holding it, whoever may read them — and
refuses a member found there; the walk goes 32 collections up and refuses
what it could not see the end of. Nestings are made one at a time, so two
collections added into each other at once cannot both pass.

Members are listed in position order, then by title; `get_collection` gives
them to an agent, and `traverse` walks the `contains` edges like any typed
relationship. Deleting a collection deletes its edges, never its members.

A page embeds a curated collection with a **collection block**: its members
as the collection's own page lists them, as each of the page's readers may
read them, and the way to the collection's page for the rest
([blocks/node-embeds.md](blocks/node-embeds.md#collection-and-document-blocks)). A mirrored
collection is shown by its integration's own block.

### A node's page

A collection's own page opens with the **node header**
(`reader/routes/NodeHeader.svelte`), read from the node and its graph for the
viewer by the read route:

- where it sits — its space, then its title — and its title, in the
  node's language;
- what it is, where its source is and who may read it: its classes (each a
  link to the class's overview page when it has one), the integration that mirrors
  its source with how it can be read ("Nextcloud · Share") — the integration
  says so ([plugins.md](plugins.md#node-views)) — and its effective
  visibility;
- its classes' fields that are set — the short ones as rows, the long ones as
  sections — its tags, and what it holds ("5 entries · 2 linked documents"), counted
  over what the viewer may read;
- its **relationships**: every edge the viewer may follow — the node at its
  other end readable, as everywhere — grouped by relationship type and
  direction and named from the node's side: a type's label going out, its
  inverse label coming in ("is in"), else the label marked incoming; untyped
  links coming in are "Referenced by". A collection's own `contains` edges
  are its members, the body below, not relationships; coming in, `contains`
  counts from a collection only. A group lists its first ten by title and
  says how many more there are;
- what its source offers to do with it (open it in the other service, for a
  viewer connected there).

Editing it is the app bar's, as on any page. Below the header, a curated
collection lists its members — each a row with its kind and, for one an
integration mirrors, that integration; a member the collection labels goes
by its label, in the reader's language, its own title below it — and one an
integration mirrors shows that source's contents as the integration draws
them, its members beside them as its linked documents.

### Two resolution rules on one hierarchy

Walking up the tree answers two different questions with different
aggregation, and it pays to keep them apart:

- **Machinery → nearest L1 ancestor.** An invoice's editor, view, routing
  and storage are those of `document`, because that is the node type it
  descends from. Not inherited per level; resolved at L1.
- **Properties → full-chain accumulation.** A class carries a property
  group; a node's fields are, for each of its classes, the class's group
  plus every ancestor's group, walked nearest-first (own class, parent, …,
  root). An invoice under `document` shows the invoice fields and the
  `documents:` fields. Property identity is the full `group:name`, so two
  different groups never collide; the one genuine collision — the same
  group reached twice, at two levels or through two classes that share an
  ancestor — is resolved by taking it once, nearest-first along the classes
  in the order of their names, so a field is never shown twice (single
  inheritance keeps each chain linear, which is what makes "nearest"
  unambiguous).

### A node's type and its classes agree

A node's **type** (`page`/`document`/`collection`) is its own, set when it is
made and kept on its row (`nodes.type`), so routing and dispatch stay a
single indexed lookup. Every class carries the type it can be given to
(`node_classes.node_type`, its nearest-L1 slug; null only for the root), and
the database keeps the two in step:

- every statement of a class carries its node's type, held by two composite
  foreign keys — `node_class_statements (node_id, node_type) → nodes (id,
  type)` and `(class_id, node_type) → node_classes (id, node_type)`: a node
  only ever has classes of its own type;
- `node_classes.parent_node_type = node_type` for every domain class,
  itself a foreign key onto the parent's `(id, node_type)`: a class's L1 is
  always its parent's L1, all the way down.

A consequence worth spelling out: because a node's storage row lives in
`pages`, `documents` *or* `collections`, **a node's type never changes**.
Giving it a class whose L1 differs from the node's type is refused (a page
cannot become an invoice-under-document), and moving a class under a
different node type is refused while any node has it or one of its
subclasses — both by the database, before any application rule. A class a
node has cannot be deleted.

### Assignment is bounded by the hierarchy

Where a class sits decides what it applies to: a class under `document` can
only be assigned to documents. This is why the editor's class picker — a
multi-select — offers the domain classes under the node's own type and
nothing else, any number of them, and names the type ("Page") when none is
chosen. Assignment is an ordinary content write (`page:write` and the node
check), transported as `classIds` in the node's `PATCH` body, every class
the node is to have; an empty list means "back to just the node type".
Admins define
domain classes (key, label, description, **parent**, property group,
optional overview page) under `/settings/schema/classes`, gated by
`class:manage` — the same schema-vs-content split as property groups and
relationship types. The four schema catalogues (properties, property groups,
relationship types, classes) form the "Semantic schema" group of the
Settings under `/settings/schema/*` (see [settings.md](settings.md)
and [design-system/overview.md](design-system/overview.md), "Settings pages"), each section
its own route with its own `:manage` permission — the set a future
knowledge-manager role would hold. The catalogue is the tree itself: rows come depth-first,
indented by level, each showing its own group and how many groups it
inherits from above; the parent picker offers node types and classes only
(never the root, never the class itself or its subtree). A class with
subclasses, or one that nodes still carry, cannot be deleted; a class cannot
be moved under itself or one of its subclasses, nor under a different node
type while nodes carry it or a subclass of it.

### Class fields

A class may carry one property group (`node_classes.property_group`,
nullable); a node's **class fields** are the accumulated definitions of every
group on the chains of its classes, each group once (`getNodeClassFields` in
`src/lib/features/semantic/nodeClasses.server.ts`, merged by `mergeChainDefinitions` in
`src/lib/features/semantic/propertyGroups.ts`). When more than one group contributes, the
fields are captioned per group, naming the ancestor a group is inherited
from when that is not one of the node's own classes. The definitions are *presets over the existing property
mechanisms*, not a third store: the class turns each definition into a slot
— a field prefilled from the node's page-wide value when one is set, blank
otherwise (`classPropertySlots` in `src/lib/features/semantic/propertyGroups.ts`) — shown in a
collapsed **"class fields"** section of the properties dialog, right under
the class selector and above the content-derived and page-wide lists.
Collapsed, because marking a property in the content is the preferred way
and a class may carry many definitions. A definition the content already
asserts through a semantic mark (`{{{name:value}}}`, the preferred way to
state a property) is content-derived and gets no slot: content has priority.
If a stale page-wide value exists for such a definition, the content entry
shows a warning with the page-wide value and a button to remove it; nothing
is dropped automatically. Values are ordinary rows in `node_properties`; the
classes only decide which names are offered as slots. Changing a node's
classes never deletes values: former slots become ordinary page-wide entries
again.
The document editor additionally shows the same slots as a form in its
canvas (metadata is a document's main content), and its dialog hides them so
they never appear twice. A definition's description, when it has one, is the
field's hint where the field is edited — `documents:source`, for instance,
says it is the bibliographic source and not the document's link. A class
with no group is a pure type — useful for querying alone.

### Querying by class

The class is an **intrinsic query condition** (`classId`, next to
`type`/`spaceId`/`createdBy` — see
[dynamic-rendering.md](dynamic-rendering.md)), available wherever a node
filter is: the query builder's field conditions, the GraphQL `nodes` and
`traverse` queries, and the MCP tools. It filters on the classes a node
**states** (`node_class_statements`) only — never on whether a node happens
to carry a class's properties; that is the whole point of explicit typing —
and matches a node when **one of its classes** does.
The builder shows class names (the picker lists every node type and domain
class as an indented tree, since classes are global vocabulary); the stored
value is the class id, so a filter in a query block survives a class being
renamed. The `nodeClasses` GraphQL query (and the MCP `schema` catalogue)
resolve names to ids for API clients and expose each class's `kind`,
`parentId` and `nodeType`. In the other direction, every query result carries
its node's `classes` — each with its id, slug and name, in the order of their
names — and a query template can bind them through the `class` mapping
source, their names joined by a comma (see
[dynamic-rendering.md](dynamic-rendering.md#authoring-the-query-builder)).

The class condition is **polymorphic by default** (RDFS subclass
entailment): "is a X" matches X and every class below it. The opt-out is the
condition's `classMatch` (`IS_A`, the default and therefore never stored, or
`EXACT`), shown in the builder as "incl. subclasses" / "exactly":

| Operator | Reads as | `IS_A` (default) | `EXACT` |
|---|---|---|---|
| `EQ` | is a X | one of its classes is X or a subclass of X | one of its classes is precisely X |
| `NEQ` | is not a X | none of its classes is in X's subtree | none of its classes is X |
| `IN` | is any of X, Y | one of its classes is in the union of their subtrees | one of its classes is one of them |

Because the node types are classes too, "is a page" with the `page` type's
id selects every page whatever its subclass, and "is exactly page" the plain
ones. There is no `EXISTS`/`NOT_EXISTS` on the class condition: every node
has a class, at least its type's, so "unclassified" is not a state to test
for — "is exactly page" is that question. Subtree expansion is a
recursive query over `node_classes` (a tiny, indexed table), exact in every
process. A class condition composes with property, link and other intrinsic
conditions like any other leaf, and has no effect on visibility: the
viewer's permissions are applied outside the filter tree, so a class filter
only narrows what the viewer could read anyway. Sorting or grouping by class
is not offered (filter-only): a node's classes are a set, so an ordering by
`classId` is refused.

### Documents are a consumer, not a special case

Document metadata (author, source, description, abstract) is the
`documents:` property group, carried by the `document` **node type** itself.
It reaches the document editor and read view through exactly the class
mechanism above: a new document, uploaded or linked
([documents.md](documents.md)), is classified as `document`,
and an editor may give it document subclasses (say, an invoice and a
report), each carrying its own metadata group. Nothing in the field-rendering path
knows about documents. The `page` type carries no group by default; giving
it one would put those fields on every page.

### Tags coexist

Tags and classes are different things and both stay:

| | Tag | Class |
|---|---|---|
| Who defines it | anyone, ad hoc | admins (domain classes); the system (node types) |
| Cardinality | many per node | exactly one |
| Implies structure | no | yes (a property group, a node type) |
| Purpose | informal, cross-cutting labels ("interesting", "2024") | explicit typing |

### Querying by tag

A tag is a query condition wherever a node filter is (the query builder's
Tags source, the GraphQL `nodes`/`traverse` queries, the MCP tools), as a
`tag` leaf next to `property`, `edge` and `intrinsic`. Because a node
carries many tags and the vocabulary is open, the operators are set
predicates, not comparisons:

| Operator | Reads as | Takes |
|---|---|---|
| `HAS` | carries the tag | `value` |
| `HAS_ANY` | carries at least one of | `values` |
| `HAS_ALL` | carries every one of | `values` |
| `HAS_NONE` | carries none of | `values` |

Matching is case-insensitive on both sides — the tag editor already treats
"Foo" and "foo" as the same tag on one node, so a query does too. A tag
condition composes with every other leaf under `and`/`or` and, like the
class condition, has no effect on visibility: the viewer's permissions are
applied outside the filter tree. The `tags` GraphQL query (and the MCP
`list_tags` tool, and the `schema` tool's appended catalogue) list the tags
on the nodes the caller may read, each with how many of those carry it —
which is what the builder's and the editor's autocomplete offer. A tag only
content hidden from the caller carries is neither named nor counted. Sorting
or grouping by tag is not offered.

### Overview pages emerge from queries

There is no separate "category page" concept. A MediaWiki-style overview of
everything in a class is a page with a query block filtering by that class.
A class may optionally point at such a page (`overview_node_id`,
`on delete set null`) purely as a convenience link — sugar over the query
mechanism, not a primitive of its own.

## Labels

Every property definition, property group, class and relationship type has
an identifier (name, namespace, slug) and human-readable names — a label, a
description, and for a relationship type an inverse label. The names are
localized text, one string per language, resolved for the viewer by one
fallback chain; the identifier never changes with the language, so queries,
mappings and marks never depend on a label ([languages.md](languages.md)).

## Naming

"Class" is the user-facing term. In code the identifiers are `nodeClass` /
`nodeClassIds` / `node_classes` (never a bare `class`), to stay clear of the
CSS/JS keyword. The three core classes are `node`, `page` and `document`
(`CORE_CLASS_SLUGS` in `src/lib/features/semantic/nodeClasses.server.ts`); those keys are
reserved.

## Related pages

- [architecture/overview.md](overview.md) — the node model this hierarchy classifies.
- [routing.md](routing.md) — how the cached node type drives dispatch.
- [authorization.md](authorization.md) — `class:manage` and why assignment is a plain write.
- [dynamic-rendering.md](dynamic-rendering.md) — how queries read properties and relationships.
- [languages.md](languages.md) — schema labels as localized text.
