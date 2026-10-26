# Graph view

The knowledge graph — every node the viewer may read and the `edges`
between them (see [dynamic-rendering.md](dynamic-rendering.md) for where the
edges come from) — is rendered by **one shared graph component**,
`src/lib/features/graph/components/GraphView.svelte`, used by the global
view (`/graph`) and by the local-graph sidebar on a page. The component
owns rendering, the camera and interaction; the physics lives behind a
small **layout-engine contract**, and everything the user can change lives
in an **overlay panel**. This page describes those parts and the decisions
behind them.

## Consumers and chrome

`GraphView` takes `nodes`, `edges` and a `chrome`:

- **`full`** (the global view): the overlay panel, the stats pill, the
  adaptive legend, sticky focus with a node card. Display settings are
  remembered per browser (`localStorage`); filters are not.
- **`minimal`** (the local-graph sidebar, `LocalGraph.svelte`): zoom/reset
  only, labels always on, hover highlighting, click navigates. The sidebar
  is a navigation tool over a handful of nodes, so it gets none of the
  analytic chrome.

Nothing in the engine, the labels or the filters is tied to where the data
came from: another node and edge set, such as a traversal's subgraph, is the
same component with `full` or `minimal` chrome.

### The settings: a panel, or a sheet on a phone

The `full` chrome's settings (`GraphPanel.svelte`) have one body and two
presentations. Beside the graph they are the floating **panel**, between the
graph's top and bottom edges, so the panel's height is bounded and it
scrolls inside itself. In a phone-width window (640 px or less) the same body
opens in a **bottom sheet** (`BottomSheet`, `size="lg"`): a long panel there
would outgrow the screen beside the graph, and the sliders toggle is the only
way back. The sheet is a dialog — focus trapped, Esc and a tap on the
backdrop strip above it close it — whose header holds the title, the number
of active filters (“Filter · 2”) and a close button, and never scrolls away;
the body scrolls under it, inside the screen minus that strip
(`--ds-sheet-gap`, the bottom bar's height) and the safe areas. Every change
still applies at once, as in the panel: the sheet can be closed at any time
and the graph is right there. Its four sections fold — View and Filter open,
Display and Forces closed to begin with, and whatever the reader opens or
closes is kept for the session (`panelSections.ts`, `sessionStorage`). Each
section's controls are one snippet both presentations render, so nothing is
duplicated. A phone held sideways keeps the floating panel: the graph's
height bounds it there, and the graph stays in view beside it.

## Layout engines and view modes

`src/lib/features/graph/layout/types.ts` defines `LayoutEngine`: `init`
(with optional seed positions), `step` (one frame, false once settled),
`positions`, `pin`/`unpin`/`unpinAll` (drag), `reheat`, `setForces`, and
`groups`/`crossGroupEdgeIndices` for engines that group. A **view mode** is an
engine behind that contract, registered in `layout/viewModes.ts`; the
renderer, the drag/focus/hover interactions, the label strategy and the
filters are mode-agnostic, so a future mode (radial around a focus, a
hierarchy tree) is one registry entry plus one engine module.

- **Standard** (`layout/standardLayout.ts`, the default) — one flat
  force-directed layout with the four classic forces: centre pull, pairwise
  repulsion, edge springs, and their rest length. Nothing else is imposed:
  connected nodes end up near each other, orphans drift to a halo around the
  connected core, and structure emerges from connectivity. Node circles
  never overlap (a hard bounding-box pass), and per-frame speed is capped so
  two nodes seeded on top of each other separate over a few frames instead
  of one being flung across the world.
- **Cluster** (`layout/clusterLayout.ts`) — the Standard mechanics plus
  community forces, in the same coordinate space. Nodes are partitioned
  into **modularity communities** (`communities.ts`: a deterministic
  Louvain — local moving phase and aggregation, nodes visited in input
  order, ties broken by the lowest community index, so the same graph always
  yields the same partition). Each multi-node community is pulled together
  around its centroid, drawn as a convex hull (`hull.ts`, colour hashed from
  the member set), and kept apart from the other hulls and from lone nodes
  by a gradual circle-separation pass — a fraction of any overlap per frame,
  capped, so hulls glide apart rather than jump. Edges between communities
  are weaker springs and are drawn dashed. A dragged node is left out of its
  community's circle so it cannot inflate it and shove the others around.
  Orphans are singleton communities without a hull; nothing is bounded to
  the viewport. An analysis view the user opts into.

Both engines share the physics primitives in `forceStep.ts`, the
simulation state and seeding in `layout/simNodes.ts`, and the node
geometry in `nodeGeometry.ts`. Switching modes or changing a filter
re-initialises the engine **seeded with the previous positions** (the
cluster engine also starts cooler then), so the picture nudges into its new
shape instead of re-scattering; a fresh mount seeds randomly — the cluster
engine placing each community around its own anchor so it starts nearly
separated.

### Forces

`layout/forceParams.ts` holds the four user-facing parameters (`center`,
`repel`, `link`, `linkDistance`), their defaults and slider ranges. The
defaults are tuned so a typical graph looks right untouched; the sliders in
the panel's collapsed **Forces** section are the escape hatch. Both engines
read them directly; the cluster engine's community forces (cohesion,
weaker cross-community springs, hull gaps) are fixed ratios of them, so a
slider change keeps the picture's proportions. Changing a force retunes the
running engine in place — never a re-initialisation.

## Labels

`labels.ts` implements the hubs-first strategy that keeps a dense graph
readable. At overview zoom only the **hubs** — the top ~20 % of nodes by
degree (tie-inclusive, minimum degree 2, soft cap of 40) — carry a label.
Zooming in fades every other label in over a band of camera scale that sits
above a typical overview fit, so the overview never shows a faint ghost of
every label. The focused node and its neighbours, and the hovered node, are
always labelled. The panel exposes this as *On zoom* (default) / *Always* /
*Never*; the sidebar's default is *Always*.

## Focus neighbourhood

Hovering a node highlights it and its neighbours and dims the rest (both
chromes). In the `full` chrome a **click** makes that focus sticky and opens
a node card (title, type, class, namespace, degree, an *Open* link); a
double-click or Enter opens the node; Escape or a click on empty canvas
clears the focus. The card is a plain positioned element that follows the
node while the layout settles — deliberately not a floating-UI overlay,
which only measures its anchor when it opens. In the `minimal` chrome a
click navigates.

## Filters

`graphFilter.ts` narrows the loaded (already viewer-scoped) graph on the
client, in the **query model's vocabulary** (see
[dynamic-rendering.md](dynamic-rendering.md)): node type, class, namespace
and relationship type are the same dimensions the query builder's intrinsic
and edge conditions use, and the pickers render the same items — the item
builders live in the query feature (`filterOptions.ts`) and both UIs call
them. A class filter is *is-a*: the class and every subclass, resolved over
the same parent links the server's recursive CTE follows (`subtreeOf` in the
semantic feature). An edge stays visible only when both endpoints do (the
same rule the server applies to viewer access); a relationship-type filter
never matches an untyped link. *Hide unconnected* then drops every
node without a visible edge — the one switch that clears orphan clutter
without special-casing orphans anywhere in the layout.

The stats pill shows *visible of total* while a filter is active. Filters
are per visit: a remembered class filter would silently hide nodes on the
next visit, so they are never persisted.

## Colour, size, legend

`nodeColor.ts` colours nodes by **type** (the default — page circle in the
accent, document square in indigo, collection diamond in the neutral colour,
which spends no categorical slot on a node type; the shape encodes type in
every mode),
or by **class** or **namespace** as an analytic overlay. Categorical hues
come from a fixed, validated eight-colour order (adjacent pairs clear the
colour-vision-deficiency gates on the app's light surface); they are
assigned over the whole loaded graph, so a filter never repaints the
survivors, and categories beyond the palette fold into one neutral *Other*.
A class takes its slot by its slug, not its label: labels follow the
viewer's language ([languages.md](languages.md)), and a class keeps its colour in
every one. The legend (`GraphLegend.svelte`) follows the active dimension
and lists only what is on screen, by label. Node size is by degree (the layout's own footprint)
or uniform; typed-edge labels can be switched off (the hover card stays).

## Authorization

Unchanged and server-enforced: `getGraph`/`getLocalGraph` return only nodes
the viewer may read and edges whose both endpoints are readable
([authorization.md](authorization.md)). The namespace filter and legend use
the viewer-scoped namespace list the root layout already provides; the
class catalogue is schema, not content. Filtering, colouring and the legend
only ever narrow that set.

## Performance

Both engines are O(n²) per frame on the main thread (pairwise repulsion,
overlap resolution), which is comfortable for graphs of a few hundred
nodes. If graphs grow by an order of magnitude, the engine contract is the
seam: an engine can run its `step` in a web worker and hand back positions,
or add a Barnes–Hut approximation, without the renderer or the panel
changing.

## Related pages

- [dynamic-rendering.md](dynamic-rendering.md) — where the edges come from;
  the query model whose filter vocabulary the graph reuses.
- [semantic-layer.md](semantic-layer.md) — classes (the is-a hierarchy) and
  relationship types.
- [design-system/overview.md](design-system/overview.md) — the primitives and tokens the
  panel, legend and node card are built from.
