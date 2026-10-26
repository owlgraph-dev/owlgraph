# Glossary

The words that mean something particular in owlgraph, or more than one thing,
each with where it is explained. The [CSS names](#css-names) at the end are a
legend for the custom properties and data attributes page content carries.

## Terms

### Acting user

The user an agent acts as: the owner of the API token its requests carry. An
agent reads and writes with exactly that user's permissions
([authorization.md](architecture/authorization.md#enforcement-in-practice)).

### Agent kind

The name an agent writes a block by in the MCP tools (`quickLink`, `grid`,
`section`). For some kinds it differs from the node type the document stores
([the block name map](architecture/blocks/overview.md#the-block-name-map)).

### Auto

A capability field with nothing stored: the element carries no value, and the
CSS falls through to the site's default. The block settings panel shows what
Auto resolves to ("Auto · 8 px")
([Capability defaults](architecture/blocks/capabilities.md#capability-defaults)).
See also [NULL means inherit](#null-means-inherit).

### Band

Two things. In page layout, a section that spans the canvas edge to edge
(`full`), or the wider column a `wide` section spans, "the wide band"
([Page settings](architecture/blocks/layout.md#page-settings)). In the chrome,
a strip that brands itself from the site theme, such as the app bar
([Tokens and rings](architecture/design-system/tokens.md#tokens)).

### Baseline

The one migration, `migrations/0001_baseline.sql`, that stands in for every
migration before it; an older database adopts it in place
([migrations.md](architecture/migrations.md#the-baseline)).

### Bleed

A section's surface reaching past the content column: a `full` section bleeds
through the gutter to the canvas edge, and a bleed-to-top hero sits flush
against the top of the canvas
([Page settings](architecture/blocks/layout.md#page-settings)).

### Block

One unit of a page's document — a paragraph, a card, a container — carrying a
`data-block-id` in the editor and on the page. Inline marks are not blocks
([Blocks](architecture/blocks/overview.md)).

### Block settings

The editor's panel for the selected block: a section of the block's own, then
one per capability it supports
([Where capabilities are edited](architecture/blocks/capabilities.md#where-capabilities-are-edited)).

### Breakpoint, tier, viewport

Page content responds to the **canvas** it is drawn in, in three **tiers** —
desktop, tablet and phone, `d`, `t` and `p` in CSS names — measured by
container queries, so the editor's previews match a device. The chrome
responds to the **viewport**, by breakpoints of its own. A breakpoint is the
width at which a tier begins
([responsive.md](architecture/responsive.md#two-kinds-of-breakpoint)).

### Canvas

The element a page is drawn in (`.page-canvas`): its ground, its width cap
and the `canvas` container the tiers are measured on. The blocks container
inside it holds the top-level blocks
([Page settings](architecture/blocks/layout.md#page-settings)).

### Capability

Typed styling data that a block kind declares and stores per tier —
typography, spacing, surface, layout, placement, height, flex cell — instead
of raw CSS ([Capabilities](architecture/blocks/capabilities.md)).

### Carrier

How a block's override set reaches its element: a rule of the per-page
stylesheet, named by `data-b`, on the page and for the editor's
Svelte-drawn blocks; a `style` attribute for the editor's other blocks
([Override sets and the carrier](architecture/blocks/capabilities.md#override-sets-and-the-carrier)).

### Chrome

The interface around content — the app bar, the editor's toolbars and
panels, dialogs, Settings — built from the design system's primitives and
`--ds-*` tokens. Page content is styled by capabilities and `--content-*`
tokens instead ([Design system](architecture/design-system/overview.md)).

### Class

In the semantic layer, a node's place in the class hierarchy, which decides
its node type and the fields it carries
([semantic-layer.md](architecture/semantic-layer.md#the-class-hierarchy)). Not
a CSS class.

### Collection

A node that holds an ordered set of other nodes, its members, curated by hand
or mirrored from another service by a plugin
([semantic-layer.md](architecture/semantic-layer.md#collections)).

### Content language, interface language

The language a node's content is written in, stored with the node, and the
language the app's interface speaks to a user. Neither follows the other
([Languages](architecture/languages.md)).

### Document

Two things. A **document node** holds an uploaded file or an external link
([documents.md](architecture/documents.md)). A page's **document** is its
content: the tree of blocks the editor edits and the renderer draws.

### Edge

A connection between two nodes in the graph: a link in a page's text, a typed
relationship, a collection's membership. A block declares the edges it makes
through its facets ([graph-view.md](architecture/graph-view.md)).

### Family

The block kinds that show one sort of node, a collection or a document, the
core's and each plugin's alike; the editor offers each family as one
([One family in the editor](architecture/blocks/node-embeds.md#one-family-in-the-editor)).

### Feature

A folder under `src/lib/features/`, one area of the app, which others reach
only through its entry points; the boundary check holds the rules
([Code layout](architecture/overview.md#code-layout-features-platform-shell)).

### Flow

Something blocks sit inside, one after another: the page, a container's
cell, a callout's body. A flow gives its contents their rhythm
([Block spacing](architecture/blocks/capabilities.md#block-spacing)).

### Frozen identifier

A name that something outside the code stores or relies on — a node type, an
agent kind, a block's CSS class — which a rename would break unless a
migration rewrites what holds it
([Frozen identifiers](architecture/blocks/anatomy.md#frozen-identifiers)).

### Gate

`npm run gate`: the build, every check and every layer of tests, which must
be green before a merge ([testing.md](guides/testing.md)).

### Grammar

A UI pattern every instance follows — the settings page, the list page, the
block settings panel — rather than a component
([Patterns](architecture/design-system/patterns.md)).

### Ground

The colour behind a text, which decides whether the text reads and which
colour scheme it takes: the page's background, a section's surface, a
button's fill ([theming.md](architecture/theming.md#scheme-regions)).

### Group

Three things. A **block group** — text, containers, media, cards — is what
the site's capability defaults are set for
([Groups](architecture/blocks/capabilities.md#groups)). A **property group**
gathers a schema's properties under a slug
([semantic-layer.md](architecture/semantic-layer.md)). A restricted
namespace's **members** are the group of users it is open to
([authorization.md](architecture/authorization.md#group-as-access-subject-restricted-namespace-membership)).

### Gutter

The side margin between the canvas edge and its content, per tier: the
site's, or a page's own
([Page settings](architecture/blocks/layout.md#page-settings)).

### Hidden is not protected

Hiding a control never stops an action: the server checks every request. And
what a reader may not read renders nothing at all, not a placeholder that
would say something is there
([settings.md](architecture/settings.md#hidden-is-not-protected)).

### Host

Told apart by what is hosted. The **plugin host** (`pluginHost`) is the core
feature that runs the plugins' server halves
([plugins.md](architecture/plugins.md#the-host)). A block that consumes a
capability hosts it, and its **kind pin** sets the values where it differs
from its group ([Groups](architecture/blocks/capabilities.md#groups)).
Otherwise a host is a machine, or another service's address.

### Island

A block component the page hydrates in the browser after the server rendered
it (`data-island`, `data-props`). A block without behaviour on the page is no
island and ships no client code
([Svelte leaf blocks](architecture/blocks/anatomy.md#svelte-leaf-blocks)).

### Kind pin

A block kind's own value for a capability default where it must differ from
its group's, set in the theme layer of its stylesheet
([Groups](architecture/blocks/capabilities.md#groups)).

### Lane

One run of the end-to-end suite under one configuration, such as the branded
lane under an extreme brand colour ([testing.md](guides/testing.md#lanes)).

### Namespace

A part of the site with its own URL prefix and its own default access level;
every node belongs to one
([routing.md](architecture/routing.md#namespaces),
[authorization.md](architecture/authorization.md)).

### Node

Anything in the graph: a page, a document, a collection, or a node of any
other class. Its node type is derived from its class
([semantic-layer.md](architecture/semantic-layer.md)).

### Node type

Two names that look alike. A node's **node type** (page, document,
collection) is derived from its class. A block's **node type** is the name its
page's document stores it under (`quickLink`, `gridCell`)
([the block name map](architecture/blocks/overview.md#the-block-name-map)).

### NodeView, node view

A **NodeView**, Tiptap's word, draws a block in the editor. A plugin's **node
view** draws the body of a node's own page for the nodes the plugin keeps
([plugins.md](architecture/plugins.md#node-views)).

### NULL means inherit

The modelling rule across the schema and the content: an unset value is
absent — a NULL column, a missing key — and takes what is above it, rather
than a value beside a flag saying whether it is set
([decision 0004](adr/0004-null-means-inherit.md)).

### Override set

A map of CSS property to value that a capability's emitter returns. A block
merges its capabilities' sets, and a [carrier](#carrier) delivers the result
([Override sets and the carrier](architecture/blocks/capabilities.md#override-sets-and-the-carrier)).

### Owl rule

The block-spacing selector, `[data-block-id] ~ [data-block-id]`, a
general-sibling variant of the "lobotomized owl" `* + *`: every block but a
flow's first gets the space above it
([Block spacing](architecture/blocks/capabilities.md#block-spacing)).

### Page

A node whose content is a document of blocks. The pages feature stores and
edits pages; the reader feature renders them
([the page-as-document model](architecture/overview.md#the-page-as-document-model)).

### Paragraph style

A named look for a text block — its element, a paragraph or a heading level,
and its typography — picked from the editor's toolbar and stored on the block
([typography.md](architecture/typography.md#paragraph-styles)).

### Parity

A page looks the same in the editor and to its readers: one component and one
stylesheet draw a block in both
([architecture overview](architecture/overview.md#editor-vs-public-render--and-why-they-must-match)).

### Per-page stylesheet

The `<style>` element a page's response carries under the response's nonce,
one rule per distinct override set, keyed by the content-addressed ids in
`data-b`. It is how styles reach a page under the strict `style-src`
([Content Security Policy](architecture/overview.md#content-security-policy)).

### Plugin, integration, source

A **plugin** is code under `src/lib/plugins/<id>/` that adds block kinds,
settings, routes or sources through the Plugin Interface
([plugins.md](architecture/plugins.md#the-plugin-interface)). **Integrations**
is the settings group where plugins are configured
([settings.md](architecture/settings.md#the-integrations-group)). A node's
**source** is where its content comes from — an upload, a link, or a
plugin's service ([documents.md](architecture/documents.md#sources),
[plugins.md](architecture/plugins.md#sources)).

### Reader

Whoever a page is rendered for: a visitor of the site, signed in or not, the
visitor of a share link, or an agent reading it through MCP. The reader
feature renders a page for one of them
([architecture overview](architecture/overview.md)).

### Rhythm

The space a flow puts above each block it holds (`blockSpace`, "Block
spacing"), inherited by the flows inside it that set none
([Block spacing](architecture/blocks/capabilities.md#block-spacing)).

### Scheme, scheme region

A colour scheme is one complete set of colour tokens, light or dark. A scheme
region is part of a page that takes a scheme of its own, because its ground
calls for it ([theming.md](architecture/theming.md#scheme-regions)).

### Section

Three things. A **page section** is a row of a columns page, bound to the
page's column template
([Page layout: sections](architecture/blocks/layout.md#page-layout-sections)).
A **settings section** is one page of Settings
([settings.md](architecture/settings.md)). A **block settings section** is
one group of rows in the block settings panel.

### Share link

An address that opens one page to anyone who has it, signed out too, while
the page itself stays internal or restricted. It grants its page, not what the
page embeds ([authorization.md](architecture/authorization.md#what-a-page-embeds)).

### Shell

Two things. `src/lib/shell/` is the app's frame — the app bar, the settings
layout, the create dialog, the About page — which only routes and hooks
import ([Code layout](architecture/overview.md#code-layout-features-platform-shell)).
The editor's **desktop shell** and **phone shell** are its two interfaces
around one core ([editor.md](architecture/editor.md)).

### Slug

A node's name in its address, unique within its namespace
([routing.md](architecture/routing.md#slug-identity-is-per-namespace-not-global)).

### Sparse

Stored and emitted only where it makes a difference: a tier's value only
where it changes what the tier above gives, a block's value only where it
differs from the default
([Emission hygiene](architecture/blocks/capabilities.md#emission-hygiene)).

### Substitute-then-sanitize

The order a query template renders in: each result's values go into the
template first, and the whole HTML is sanitized after, so no value can carry
markup the sanitizer did not see
([dynamic-rendering.md](architecture/dynamic-rendering.md#template-parameters)).

### Surface

Mostly the **Surface capability**: a block's background — a colour, and on
containers an image — border, radius and shadow
([Capabilities](architecture/blocks/capabilities.md)). In the design system, a
surface is an area the chrome draws on, such as a panel or a dialog. An
**authored surface** is an element inside a block that an author's
capabilities style, as opposed to a control
([Svelte leaf blocks](architecture/blocks/anatomy.md#svelte-leaf-blocks)).

### Token

Three things. A **design token** is a `--ds-*` custom property of the chrome,
a **content token** a `--content-*` one of page content
([Tokens and rings](architecture/design-system/tokens.md#tokens)). An **API
token** is the credential an agent or a script signs in with
([mcp.md](architecture/mcp.md)).

### Unknown block

A stored node of a type the running build does not define, such as a removed
plugin's block. The editor keeps it as a stand-in that can be moved or
deleted but not edited, and readers see nothing of it
([Unknown blocks](architecture/blocks/anatomy.md#unknown-blocks)).

### Viewer-scoped

Answered as the current viewer may see it: every query, embed and listing runs
under the reader's own permissions, never the author's or an elevated one
([authorization.md](architecture/authorization.md#the-rule)).

## CSS names

### Custom properties

| Name | What it holds |
|---|---|
| `--ds-*` | the chrome's design tokens ([Tokens and rings](architecture/design-system/tokens.md#tokens)) |
| `--content-*` | page content's palette (`--content-theme-*`), the ladders a default is set in (`--content-pad-*`, `--content-radius-*`, `--content-rhythm-*`), its widths and gutters |
| `--type-*` | the content type scale, `--type-xs` to `--type-6xl` ([typography.md](architecture/typography.md)) |
| `--default-*` | the site's capability defaults for a block's group, and a kind's pins |
| `--<capability>-<field>-<tier>` | one capability value at one tier: `--surface-bg-d`, `--typography-size-p`, `--layout-wrap-t`, `--placement-w-d`, `--flex-item-flex-p`, `--min-height-d`, `--space-above-t`; padding is `--pad-<tier>`, with `-top`, `-right`, `-bottom` or `-left` for a side that differs |
| `--block-space-*`, `--flow-space-*` | a flow's rhythm per tier, as its contents read it and as a container passes it on |
| `--canvas-*`, `--page-columns-*` | a page's widths and its column template, on the canvas |
| `--quick-link-*`, `--table-*` | a block kind's own values |

A tier suffix is `d`, `t` or `p`: desktop, tablet, phone.

### Data attributes

| Attribute | What it says |
|---|---|
| `data-block-id` | the element is a block, and this is its id |
| `data-b` | the id of its rule in the per-page stylesheet |
| `data-island`, `data-props` | a block the page hydrates, and its props |
| `data-scheme` (`-d`, `-t`, `-p`) | a scheme region and its scheme, per tier where it differs |
| `data-width` | a top-level block's span, `wide` or `full` |
| `data-bleed-top` | a hero flush against the top of the canvas |
| `data-column`, `data-scroll`, `data-reflow` | the tiers at which a flex row runs as a column or scrolls, or a grid's cells reflow |
| `data-ps` | a text block's paragraph style |
