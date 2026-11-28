---
status: accepted
date: 2026-11-25
---

# 0028. A node's IRI is built on its id, and the API's identifiers expand to IRIs

## Context

owlgraph aims at RDF: nodes exported with their classes, properties and
relationships
([decision 0020](0020-the-core-is-the-graph-and-a-body-comes-from-a-plugin.md)).
RDF names everything by an IRI.
[Decision 0021](0021-the-semantic-layer-follows-rdfs-and-owl-and-a-class-has-a-shape.md)
gives a vocabulary a namespace IRI, so a term has one. A node has none.

A node has two identities ([routing.md](../architecture/routing.md)). Its
id, a UUID, never changes, and is what one node stores of another. Its
address — its namespace's prefix and its slug — changes when the node is
renamed or moved and is never redirected. An address also says where a node
sits, which a reader who may not read the node must not learn
([spec 002](../features/002-visibility-and-spaces.md)).

The public API ([spec 004](../features/004-headless-graph-backend.md)) will
be held to whichever identifiers it ships with. A client that stored them
should not have to map them again when RDF arrives.

## Decision

**A node's IRI** is an `https` IRI of three parts: a **base IRI** the
operator sets, which defaults to the instance's own origin; a fixed path
among the app's own addresses, under `/-/`; and the node's id. It is built
on the id alone, so it never changes with a rename or a move, and says
nothing of where the node sits.

**The IRI resolves.** For a reader who may read the node it leads to the
node's current address, or to the node in the API where the instance shows
no pages. For anyone else it is not found, as for a node that does not
exist.

**A term's IRI** is its vocabulary's namespace IRI followed by its name. An
instance's own vocabularies have their namespace IRIs under the base IRI; a
vocabulary taken in from elsewhere keeps the IRI it has there.

**The API keeps the short forms.** A request and a response identify a node
by its id and a term by its name. Every node, vocabulary and term also reads
with its IRI, and the expansion from the short form to the IRI is fixed and
part of the API's documentation. An export to RDF uses the IRIs the API
already gave.

## Consequences

- RDF changes no identifier. What a client stored — an id, a term's name —
  expands to its IRI by a rule the client already has.
- The base IRI is set once. An instance that moves to another origin either
  keeps its base IRI as a name, which then resolves only while the old
  origin still answers, or changes every IRI it ever gave out. The
  deployment guide has to say so before the first IRI leaves an instance.
- An IRI gives nothing away. It holds an id, and resolving it is checked
  like every other way to a node.
- The resolver is one more address of the app, under `/-/`, where no slug
  can shadow it.
- Names stay fit for an IRI: a term's name and a vocabulary's prefix keep to
  letters, digits, hyphens and underscores, as they do today.
- A vocabulary's namespace IRI can be set to a published one — Dublin
  Core's, schema.org's — so that an instance's terms are those terms.
  Changing a namespace IRI changes the IRI of every term under it.

## Alternatives considered

- **`urn:uuid:`**: independent of any address, so it survives every move.
  But nothing can follow it to the node, which is what linked data is for.
- **Both, declared the same**: movable and followable, with two names for
  every client to handle.
- **The node's address as its IRI**: readable, but it changes with a rename,
  and names the node's namespace to a reader who may not read it.
- **IRIs as the API's only identifiers**: one form everywhere, at the price
  of long identifiers in every request and filter, while stored content
  keeps the short forms regardless.
- **Short forms only, IRIs with the export**: least to build now. A client
  would learn the IRIs later, with no say left in what they are.
