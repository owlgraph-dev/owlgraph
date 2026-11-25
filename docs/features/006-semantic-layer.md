---
status: ready
issue:
adrs: ['0001', '0002', '0020', '0021', '0024', '0026', '0027', '0028']
updated: 2026-11-25
---

# 006. The semantic layer

## Problem

People who model knowledge need to say what their things are, what they
carry and how they relate, in terms that mean the same to a person, a query,
an agent and another system. owlgraph's schema does not let them yet. A node
is exactly one thing, and that one class also decides how the node is
stored. Property groups do five jobs at once. A relationship exists only
where a page states it, and nothing says where a statement comes from. What
follows from the schema — that an invoice is a document, that whatever has
an author was written — has to be spelled out node by node.

Whoever builds on the graph needs a schema in the terms others use (RDFS,
OWL, SKOS), nodes that are several things at once, a statement of which
fields a class's nodes should carry, conclusions drawn from the schema when
they ask, and for every statement where it comes from. And as everywhere:
nothing a reader learns may rest on what they may not read.

## Scope

- **Vocabularies.** Every term lives in a vocabulary: a prefix and a
  namespace IRI. An instance has its own and can add others.
- **Classes.** A hierarchy of classes. A node has any number of them, or
  none, and a class says nothing of what a node holds.
- **Properties and relationship types**, each with an optional parent, an
  optional domain and range and, for a relationship type, an optional
  inverse and the properties its edges carry.
- **Shapes.** The fields the nodes of a class, or the nodes with a kind of
  body, should carry. A shape reports what is missing and never refuses a
  save.
- **Inference**, when a query runs: by subclass, by a term's parent, by
  inverse, and by the domains and ranges that infer.
- **Origins.** Every statement says where it comes from: stated directly, or
  by a node's body. What a body states is the body's to change.
- **For the viewer.** Statements, inferences and reports are what their
  reader may read, and no more.
- **Carried over.** Everything an instance holds keeps its meaning.

## Non-goals

- Exporting RDF or SHACL, and SPARQL. They build on this capability and get
  a spec of their own.
- Loading a published vocabulary's terms from a file or an address. An admin
  adds a vocabulary under its published IRI and defines the terms they use.
- Reasoning beyond the four rules: restrictions, disjoint classes,
  transitive relationships, cardinalities as conclusions. A traversal walks
  a chain; a shape checks what needs checking.
- Storing anything inferred.
- A shape that refuses a save.
- A class with more than one parent. The model leaves room for it.
- A concept of its own for taxonomies. Terms used as values — topics,
  regions — are nodes of a concept class joined by `broader`. Tags stay the
  informal layer.
- A body that states a node's class. No kind of body does.
- Dropping or rebuilding on demand what a plugin's bodies stated. That comes
  with bodies as plugins.
- Who stated a direct statement, and when.

## Acceptance criteria

Vocabularies and terms:

1. Every class, property and relationship type belongs to one vocabulary and
   is named by that vocabulary's prefix and its own name, `prefix:name`. A
   term of the instance's own vocabulary is named by its name alone. Within
   a vocabulary no two classes share a name, and no two of its properties
   and relationship types do.
2. A user who may manage the schema creates a vocabulary with a prefix and a
   namespace IRI, and changes its label, its description and its IRI. A
   prefix never changes. A prefix that is taken or reserved is refused, and
   a vocabulary that still holds a term, or whose prefix a stored name still
   uses, cannot be deleted.
3. A vocabulary and a term have a label and a description in each of the
   site's languages. A name never changes with the language.
4. A property name in use with no definition behind it keeps working: it is
   stored, shown and found by queries, valued as text, and belongs to no
   shape. Such a name is listed and counted only from the nodes its reader
   may read.
5. The prefix `parameter` is reserved for query templates. No vocabulary,
   term or property value uses it, and a template's parameters appear in no
   list of the schema.

Classes:

6. A node has any number of classes, or none. Whoever may change a node
   gives it a class and takes one away, and neither ever deletes a property
   value or a relationship.
7. Any class can be given to any node, whatever its body.
8. A class has at most one parent and is never its own ancestor. A class
   that a node has, or that another class sits below, cannot be deleted.
9. Wherever a node is shown or returned — its header, a query's result, the
   API, an agent's tools — it comes with every class it has. An inferred
   class is marked as inferred, with what it follows from.

Properties and relationship types:

10. A property has a datatype. A relationship type joins a node to a node,
    says which properties its edges may carry, and may name its inverse. An
    edge is stored once and reads from its other end under the inverse.
11. A property and a relationship type may each have a parent of its own
    kind, and neither is ever its own ancestor.
12. A property or a relationship type may declare a domain, and a
    relationship type a range, each as a suggestion or as an inference. A
    suggestion decides what a picker offers first and nothing else: no
    statement is refused for it, and nothing follows from it.

Shapes:

13. A class has a shape: the properties and relationship types its nodes
    should carry, each with whether it is required, how many values it may
    have and its place in the order. A kind of body may have a shape too,
    and every document shows the document fields by one.
14. A node is offered the fields of every class it has, stated or inferred,
    of each of their ancestors and of its kind of body. A field that several
    shapes name is offered once.
15. A node that lacks a required field, or holds more values than a field
    allows, is saved all the same. What falls short is reported with the
    node, to whoever may change it.
16. A report is made from what its reader may read: a value they may not
    read counts as absent for them.
17. Changing a shape changes what is offered and reported from then on. It
    changes no node and deletes no value.

Inference:

18. A node of a class is also of each of that class's ancestors, and a
    condition on a class finds the nodes of its subclasses too.
19. A statement made with a property or a relationship type also holds for
    each of that term's ancestors: a condition on a term finds statements
    made with a term below it.
20. A relationship can be asked for from either end: asking by its inverse
    from the target finds what the relationship itself finds from the
    source.
21. A node that has a property, or starts a relationship, whose domain
    infers a class is of that class. A node at the end of a relationship
    whose range infers a class is of that class.
22. An inferred class or relationship counts wherever a stated one does: in
    a condition, a traversal, a node's classes and relationships, a count
    and a shape. A query can ask for what is stated alone, and every answer
    says of a class or a relationship whether it is stated or inferred.
23. Nothing inferred is stored. A change to the schema — a parent, an
    inverse, a domain, a range — changes what follows at the next read, with
    no node touched, and removing a statement removes at once whatever
    followed from it alone.

For the viewer:

24. A statement is readable to a viewer only if they may read every node it
    rests on: the node it is about, for a relationship the node at its other
    end, and the node whose body stated it. One they may not read is absent
    for them.
25. An inferred class or relationship holds for a viewer only if every
    statement it follows from is readable to them. A node that is of a class
    only by the range of a relationship from a node the viewer may not read
    is not of that class for them.
26. What a viewer may not read changes nothing they can observe: a node's
    classes, the fields it is offered, a query's results and their counts
    and a shape's report are what they would be if the unreadable statements
    did not exist.
27. The schema is read by whoever may read it today, whatever nodes they may
    read. A class's name on a node is seen by whoever may read the node.

Origins:

28. Every statement — a node's stated class, a property value, a
    relationship — says where it comes from: stated directly, or by the body
    of a node, and then which node and which plugin its kind of body comes
    from.
29. Whoever may change a node states a relationship from it to a node they
    may read, with its properties, directly, and changes or removes it,
    without writing any content.
30. Saving a body replaces what that body stated and nothing else. A direct
    statement on the same node stays, one that says the same as the body
    included. Removing a body removes what it stated.
31. The same relationship or value stated by a body and directly is shown
    once, with both origins. A query, a traversal and every count take it
    once.
32. Changing or removing a body's statement directly is refused, and the
    refusal names the body it comes from.
33. When a plugin is removed or cannot be reached, the statements its bodies
    made stay, with their origin.

What an instance carries over:

34. An instance that upgrades loses no class of its own making, no property
    value and no relationship. Every node keeps its classes; a type class's
    place is taken by the node's kind of body.
35. Every name stored before means what it meant: a property in a page's
    text, in a node's properties, in a filter or a template; a relationship
    type in a link or a filter; a class in a filter. A filter that named a
    type class finds the same nodes as before.
36. A value from a page's content is its body's afterwards, and a value set
    on a node is direct. Every link a page made is its body's. A curated
    collection's members are direct, and a mirrored collection's are its
    plugin's.
37. The `page` datatype is gone. A property that was defined with it is a
    text property afterwards and keeps every value.

## Affected components

- [Semantic layer](../architecture/semantic-layer.md): the whole page.
  Vocabularies in place of property groups, classes apart from node types,
  shapes, a term's parent, inverse, domain and range.
- [Dynamic rendering](../architecture/dynamic-rendering.md): conditions on a
  set of classes and on the kind of body, inference in the list query and in
  traversal, a template's keys.
- [Authorization and visibility](../architecture/authorization.md): when a
  statement is readable, inference for the viewer, who may change a node.
- [Graph view](../architecture/graph-view.md) and the node header: one
  relationship for several statements, its origins, inferred relationships.
- [MCP](../architecture/mcp.md): the tools that read and name classes,
  properties and relationships.
- [Settings](../architecture/settings.md): the sections of the semantic
  schema.
- [Blocks](../architecture/blocks/overview.md): what a page's content
  states, and under which origin.
- [Plugins](../architecture/plugins.md): the members a mirrored collection's
  plugin makes, as its statements.
- [Search](../architecture/search.md): filters by class.
- [Languages](../architecture/languages.md): the labels of vocabularies and
  terms.
- [Overview](../architecture/overview.md) and the
  [glossary](../glossary.md): the node model, and the words vocabulary,
  shape, origin, body and kind.
- [Migrations](../architecture/migrations.md): the data every instance
  carries over.

## Decisions and constraints

- [0021. The semantic layer follows RDFS and OWL, and a class's fields are a shape](../adr/0021-the-semantic-layer-follows-rdfs-and-owl-and-a-class-has-a-shape.md):
  the four concepts, shapes, and inference when a query runs.
- [0020. The core is the graph, and a node's body comes from a plugin](../adr/0020-the-core-is-the-graph-and-a-body-comes-from-a-plugin.md):
  a class is semantics only, and every statement records its origin.
- [0024. A statement records its origin, and what a body states is the body's to change](../adr/0024-a-statement-records-its-origin.md):
  the origin of a statement, and when a statement is readable (criteria 24
  and 28 to 33).
- [0026. A node has at most one body, named by its kind, and the type classes go](../adr/0026-a-node-has-at-most-one-body-named-by-its-kind.md):
  classes apart from the kind of body, and a shape for a kind (criteria 7,
  13, 34 and 35).
- [0027. One rule says who may change a node, and every node has a share list](../adr/0027-one-rule-says-who-may-change-a-node.md):
  who "whoever may change a node" is (criteria 6, 15 and 29).
- [0028. A node's IRI is built on its id, and the API's identifiers expand to IRIs](../adr/0028-a-nodes-iri-is-built-on-its-id.md):
  a vocabulary's namespace IRI and a term's IRI (criterion 2).
- **The `page` datatype is withdrawn**, which decision 0021 left open. It
  stored text and never a node, and what it was meant for is a relationship
  or a link (criterion 37).
- [0002. Authorization is server-enforced and viewer-scoped](../adr/0002-authorization-is-server-enforced-and-viewer-scoped.md):
  [spec 002](002-visibility-and-namespaces.md) holds unchanged, and its
  promise extends to statements, inferences and reports.
- [0001. Migrations are immutable and forward-only](../adr/0001-migrations-are-immutable-and-forward-only.md):
  every change to what an instance stores is a migration of instances that
  hold data, and criteria 34 to 36 hold for each.
- **Inference stays a bounded rewrite of the query.** What a query grows by
  depends on the size of the schema, never on the number of nodes, and the
  bounds a traversal has today still hold.
- **Names stay fit for an IRI**: a prefix and a name keep to letters,
  digits, hyphens and underscores.
- **The same in the editor and for the reader.** A node's classes, its
  fields and its relationships are shown alike wherever the node is shown.

## Open questions

None blocks the work.

- Where the app lets a person state a relationship directly, and whether a
  schema manager gets a list of the nodes that fall short of a shape. The
  criteria hold through a node's own views, the API and an agent's tools.

## Implementation notes

None yet.
