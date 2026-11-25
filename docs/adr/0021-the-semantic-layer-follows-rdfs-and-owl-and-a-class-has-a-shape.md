---
status: proposed
date: 2026-11-25
---

# 0021. The semantic layer follows RDFS and OWL, and a class's fields are a shape

## Context

The semantic layer has four concepts — properties, relationship types,
classes and property groups ([semantic-layer.md](../architecture/semantic-layer.md)) —
and the fourth does five jobs:

- the prefix of a property's name (`core:status`, `documents:author`);
- a bundle of fields a class carries, accumulated down its chain and
  resolved nearest-wins where two groups collide;
- the set of properties authors state facts with in a page's text;
- the template parameters (`parameter:`), which are no facts at all;
- the properties a collection's `contains` edges carry (`collection:`).

A node has exactly one class, and the class decides the node's storage
([decision 0020](0020-the-core-is-the-graph-and-a-body-comes-from-a-plugin.md)
separates the two). A property of the `page` datatype names a node, but no
edge records it, so the graph, traversal and a node's relationships miss it.

owlgraph aims at RDF and OWL: a node's classes stated or inferred, in an open
world, and exported as RDF. OWL does not say which fields a class's nodes
should carry. `rdfs:domain` says that whatever has the property is in the
class: an inference, not a field. And every read is the viewer's
([decision 0002](0002-authorization-is-server-enforced-and-viewer-scoped.md)):
nothing a reader is shown may depend on a node they may not read.

## Decision

The semantic layer has four concepts, each with one job, named after the
vocabulary they export to:

- **Vocabulary**: a set of terms under a prefix and a namespace IRI. An
  instance has its own and may take in others (Dublin Core, schema.org,
  SKOS). A term is named `prefix:name`; today's group prefixes become
  vocabulary prefixes, so every stored name keeps its meaning.
- **Class** (`owl:Class`): what a node is. Classes form a hierarchy
  (`rdfs:subClassOf`). A node has any number of classes, stated or inferred.
  A class says nothing about how a node is stored or what body it has.
- **Property** (`owl:DatatypeProperty`): a value of a datatype on a node.
- **Relationship type** (`owl:ObjectProperty`): from a node to a node, with
  its inverse and the properties its edges may carry. A value that is a node
  is a relationship, never a property.

A property or a relationship type may declare a domain and a range, each
term choosing how: as a **suggestion**, the default — offered by pickers,
exported, never inferred from, like schema.org's `domainIncludes` — or as an
**inference**, `rdfs:domain` and `rdfs:range`.

**A class's fields are a shape**, in SHACL's sense: a node shape that
targets the class and lists the properties and relationships its nodes
should carry, whether each is required, how many it may have, in what order.
A node gets the fields of every class it is in and of their ancestors, as a
union. A shape checks what is there, closed-world, and reports what is
missing; it never refuses a save.

**Inference happens when a query runs.** A class condition, a node's classes
and its relationships expand by subclass, subproperty, inverse and the
domains and ranges that infer — roughly the OWL 2 QL profile — over what the
reader may read. An inferred class holds for a reader only if the statements
it follows from are readable to them. Nothing inferred is stored; should it
ever be, it keeps the statements it follows from, as an origin of its own.

Taxonomies of terms used as values — topics, regions — are nodes of a
concept class joined by `broader`, as in SKOS, and not a concept of the
semantic layer. Tags stay the informal layer. Template parameters leave the
semantic layer for the query templates.

## Consequences

- Property groups go. Their prefixes become vocabularies, the groups a class
  carries become its shape, `collection:` becomes what `contains` edges
  carry, and `parameter:` belongs to the templates.
- Property names stored in page content, query filters and templates keep
  working unchanged.
- A node's class becomes a set. Every reader of it — the node header,
  queries, GraphQL, the MCP tools — handles several. The header shows the
  stated classes first and marks an inferred one as inferred, with what it
  follows from.
- The nearest-wins rule goes: fields are a union of terms with one identity
  each, so nothing collides, and a class may later get several parents with
  no new rule.
- Properties of the `page` datatype become relationships, and their values
  edges.
- Inference makes queries larger. The subset is chosen so that each
  expansion stays a bounded rewrite of the query; storing inferences is the
  answer only if that proves too slow.
- Spec 002's promise extends to inference: what a reader learns about a node
  never rests on a node they may not read.
- Reasoning over restrictions, cardinalities or disjoint classes is out of
  scope; a shape checks what needs checking.
- RDF and SHACL exports map onto the model term for term.

## Alternatives considered

- **Property groups attached to classes**: what exists. Indirect, one
  concept for five jobs, and collisions settled by a rule.
- **Fields from `rdfs:domain`**: every field becomes an inference, so one
  misused property reclassifies a node and the export claims what nobody
  meant.
- **Storing inferences**: faster reads, but every stored inference must be
  filtered per reader by what it follows from and kept in step with every
  write.
- **One class per node**: a simpler header and simpler queries, but
  inference yields several classes anyway, and modelling would be cramped.
- **A full OWL reasoner**: expressive, but heavy, hard to scope per reader,
  and more than a knowledge platform needs.
