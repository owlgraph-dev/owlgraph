# Search

Finding content has two views over one set of rules:

- **The search overlay** (Ctrl/Cmd-K, the app bar's search button) is the
  quick jump: type, pick a result, go there. It asks the GraphQL `search`
  field (`searchContent`, `src/lib/features/search/search.server.ts`). Its
  type filter narrows to pages or documents; collections come with *All*.
- **The search page** (`/search`) is where content is browsed: a term and
  filters that are a URL, a list or grid of results, a page at a time. It is
  the *browsed* surface of the query system, as the query block is its
  *authored* one ([dynamic-rendering.md](dynamic-rendering.md)).

Both match a term the same way — `src/lib/features/search/ftsSql.server.ts`
holds the one definition of how a term matches, ranks and is excerpted, in
every content language ([languages.md](languages.md#search)) — and both filter by node
type the same way. The overlay leads to the search page in two places. Its
list ends with "Show all results", which opens the page with the overlay's
term and type filter; with nothing found, that item is the selected one, so
Enter still hands the term over. And its footer, there in every state — before
anything is typed too — says "Advanced search": the same page with the term
and type filter so far, or with none, where the page lists everything. The
list item is the keyboard's way (arrows and Enter); the footer is the one
always in view, reached by Tab.

Choosing a node — a page, a document or a collection to add to a curated
collection — is neither view: it matches titles, not text
([The node picker](#the-node-picker)).

## The search page's URL

The URL is the page's whole state. Every control shows what the URL says and
changes it by navigating to a new URL, so a filter set is a link — an "All
concepts →" on a landing page is `/search?class=concept` — and Back steps
through the filters a reader tried.

Content links to it as a path on this site: a quick link's picker offers the
search page among the site's own pages, and its address can carry any
filter (`/search?class=concept&view=grid`); a nav or footer entry takes the
same path. Either opens in the same tab
([blocks/node-embeds.md](blocks/node-embeds.md#quick-link-targets)).

| Parameter | Value | Meaning |
|---|---|---|
| `q` | text | the full-text term |
| `class` | a class's key | nodes of the class **and every class below it** |
| `exact` | `1` | with `class`: nodes of that class only |
| `tag` | text, repeatable | nodes carrying **any** of the tags (case-insensitive) |
| `type` | `page`, `document` | one node type |
| `namespace` | a namespace's slug, `_default` | one namespace; `_default` is the root-routed default namespace, which has no slug |
| `sort` | `relevance`, `updated`, `created`, `title` | the order; the default is relevance with a term and most recently updated without one |
| `view` | `list`, `grid` | how the results are laid out |
| `page` | 1, 2, … | which page of results |

Every value is an identity — a class's key, a namespace's slug, a node type —
never a label, so a link survives a renamed class. An unknown parameter is
ignored and an invalid value falls back to its default, silently: a stale or
hand-edited link still shows a sensible list. A sort that is the default
anyway is left out of the URL, so a term added later still sorts by
relevance. With no parameters at all the page lists everything the viewer may
read, most recently updated first.

## One translation layer

The URL becomes a query in three steps, and nothing else translates it:

1. **Syntax** (`searchUrl.ts`, shared by the server and the browser):
   `parseSearchParams` reads the parameters, `searchHref` writes the
   canonical URL of a state — only what differs from the default, in a fixed
   order. The page's controls, its pagination, the empty state's reset and
   the overlay's handoff all build their links with `searchHref`.
2. **Resolution** (`searchQuery.server.ts`): a class key becomes the class, a
   namespace slug a namespace the viewer may see (below). What took effect is
   the *applied* state, which the page mirrors — a parameter that was dropped
   disappears from the controls.
3. **The query definition** (`searchQuery.ts`, `toListQuery`): the applied
   state in the query model's own shape — a filter in the wire format a query
   block stores, a sort, the term and the page's window. The class condition
   is the polymorphic one with `classMatch: EXACT` as the opt-out, the tags a
   `HAS_ANY` condition, type and namespace intrinsic conditions, AND-ed.

The third step is the seam a stored query would use: its filter and sort
would load into the same shape instead of being built from the parameters.

## The resolver

The page runs the query feature's `listNodes`
(`src/lib/features/query/graphql/nodes.server.ts`) — the same validation,
filter compiler and visibility predicate as the GraphQL `nodes` query and
query blocks, over pages, documents **and** collections, with a full-text
term, relevance order and the total. There is no second engine: the search page is the
filter list with a term added, not the overlay's search with filters added.
See [dynamic-rendering.md](dynamic-rendering.md#the-list-query).

## What a viewer sees

The page is open to anonymous visitors (it is on the public-route list,
[authorization.md](authorization.md#the-route-level-gate)) and lists only
what its viewer may read:

- **The visibility predicate is the query's own**, outside the filter, so no
  parameter can reach past it; the total counts the same rows after it, so a
  count never includes a node the viewer cannot read.
- **A namespace applies only if the viewer may see it**
  (`listNamespacesForUser`). An unknown namespace and one the viewer may not
  see are treated alike: dropped, never applied, never named in the count.
- **A class is vocabulary, not content.** A known class applies whether or
  not the viewer can read any of its nodes — a link into content the reader
  cannot see shows no results rather than everything — and its name may
  appear in the count line.
- **What the filters offer comes from readable content**: the class picker
  lists the classes of nodes the viewer may read and the classes above them,
  the tag field suggests the tags of those nodes.
- **A page is found by its own words**, never by what it embeds: a
  collection block's members and a document block's file are not the page's
  text ([blocks/node-embeds.md](blocks/node-embeds.md#collection-and-document-blocks)). The
  collection and the document are found themselves, each by whoever may read
  it.

## Results

One card serves pages, documents and collections, in both views
(`SearchResultCard`):

- the title, the card's one link;
- what the node is: its class; for a document, its kind instead — PDF, text,
  Markdown, or a link with its host — and the class too when it is a document
  subclass, which says more than "Document";
- a collection — which has no text of its own — is found by its title and
  its metadata, and leads with no excerpt unless one of those matched; and
  by what it holds: the title of a member the viewer may read
  (`memberTitleMatches`, the title part of each member's vector), its
  excerpt then that title — "Contains: Kalibrierung Q3" — whether it is a
  curated collection's member or a mirrored one's linked document. The match
  is made when the viewer searches, for them alone: nothing of a
  collection's members is kept with it, so a member renamed, taken out, or
  one the viewer may not read never finds it. The search overlay and the
  search page match alike;
- a node an integration backs is also found by what its source says of it
  ([plugins.md](plugins.md#sources)) — a mirrored folder's name, the folders
  a file sits in and its name, the integration's own — so a renamed
  collection is still found by its share's name, and a document by its
  file's name once bound to another; those words are part of its metadata;
- an excerpt: with a term, the text around the match with the match marked;
  otherwise a description-like property — the first one whose local name is
  `description`, `abstract` or `summary`, whatever its group — and otherwise
  the start of the content as a reader sees it;
- when it was last updated, its namespace — unless it is the default
  namespace, the site's root, which every card would otherwise name — and its
  tags.

The title and the excerpt are content and carry the node's language (`lang`);
the rest is chrome, in the interface language. The list view stacks the
cards; the grid view fits as many columns as the page's width allows, one on
a phone. In the grid the cards of a row share one height — the tallest's —
with the date, namespace and tags at each card's bottom and the excerpt cut
to four lines, so a row ends evenly and still reads left to right in the
order the results rank. (A column flow that packs cards under each other
would read top to bottom instead, and native masonry is not yet in every
browser.) The search page uses a wider column than the app's other pages for
it (`--ds-width-browse`).

Above the results, the count line says how many there are and restates the
applied filters in prose ("24 pages for “graph” · class Concept (incl.
subclasses) · tagged ai or ml · in namespace Wiki"); it is the page's one
live region. Below them, `Pagination` ([design-system/overview.md](design-system/overview.md))
links every page; a page past the end — a list that shrank since a link was
made — redirects to the last page, so the address never names a page other
than the one shown. An empty list says so and, when filters are set, links
back to the unfiltered list.

Each filter combination is a URL of its own, an endless space for a crawler,
and everything listed is indexed at its own address, so the page asks search
engines not to index it (`noindex, follow`).

## On a phone

The filters have two presentations of the one URL state. A wide window shows
them as one inline row. A phone, a tablet 768 px wide or narrower and a phone
held sideways — the chrome's narrow tier
([responsive.md](responsive.md#two-kinds-of-breakpoint)) — show a compact row
instead:

- **Filter · N**, where N is the number of active filters, which opens the
  filter sheet;
- the **active filters as chips** — the class (“Concept + subclasses”, or
  “Concept” alone when it is exact), each tag, the type, the namespace — each
  removable, in a strip that scrolls sideways inside the row, its edge faded
  where more wait;
- **sort** and **view** as icon buttons; sort opens a short sheet of the
  orders.

Nothing to be *seen* is hidden: only the filters not in use fold away, and
the count line still restates every applied filter in prose for the chips
scrolled out of view. Both presentations take their items from the same
place (`search/routes/filterItems.ts`) and change the URL through the same
`go()`; CSS shows one of them, so there is no second filter implementation
and nothing to keep in step.

**The filter sheet** lists every filter in one column of touch-sized rows:
the class, with “Include subclasses” beneath it (the inverse of `exact`),
the tags, the type, the namespace (the viewer's own only), the sort and the
view. It works on a pending copy of the state, taken as it opens: nothing
applies until its footer button, and closing the sheet any other way drops
the changes — the list does not change while the sheet is open. The button
says how many results the pending filters will list, counted as they change
(debounced) by `/api/search-count`, which takes the page's own URL parameters
through the same chain — parse, resolve against the viewer, the query model's
count — so the number is the one the page shows once applied, and never
counts what the viewer cannot read. While nothing has changed it is the
list's own total and nothing is fetched; while a newer count is on its way
the last one stays, and the button is never disabled. **Reset** clears the
filters and keeps the term, the order and the view.

The search field takes the whole row on every window, its submit an icon
inside it (`SearchField`), so it needs no button beside it.

## The node picker

Where an editor chooses a node — a member for a curated collection
([semantic-layer.md](semantic-layer.md#collections)), the collection or the
document a block shows ([blocks/node-embeds.md](blocks/node-embeds.md#collection-and-document-blocks)),
the page or document a link goes to ([blocks/node-embeds.md](blocks/node-embeds.md#quick-link-targets)),
the page a setting names (a nav entry, a footer link, the home page, a class's
overview page — `PagePicker`, the picker inline in the form, each page with its
address) — the search feature's node picker (`$lib/features/search/picker`) finds it by its
title. It is a picker, not a
search: a title holds the term or it does not, and the picker says so.

- **Nothing before a term** — or, where the caller asks (the link picker), the
  nodes the editor worked on last: a page they saved, a node they made, the
  latest first, under "Recent". Typing searches (after a short pause). Every node of the types offered that the editor may read
  matches when its title holds the term — case aside, the term as written
  (`%` and `_` are characters, not wildcards), across every namespace. A title
  that *is* the term comes first, then the most recently changed.
- **A page at a time.** The footer states the rule and the count ("Title
  contains “…” · 12+ matches"); **Show more** adds the next page. No total is
  counted: "12+" says only that more follow.
- **The rows** show each node's glyph, its title, and below it its type (when
  the picker offers several) · its namespace · the integration that keeps it.
  A caller may add rows of its own before the matches, drawn alike: the link
  picker's "Link to …" for a typed address and the site's own pages.
  What a row says beyond that — "In this collection", why it cannot be
  picked — is the picker's caller's; a row the caller disables keeps its reason
  at full contrast and is skipped by the arrow keys. The highlighted row says
  what Enter does ("Add"). Chips narrow the types (All · Pages · Documents ·
  Collections).
- **Making what nobody's title is.** For a typed term, a "New page “…”" row
  per type the caller lets it make follows the matches, naming the namespace
  the node goes into (the collection's own) — but none for a type that has a
  node titled exactly so, which is listed first instead, and none for a viewer
  who may not edit. A page or a collection is made at once and picked; a
  document opens its form (an upload or a link) in the picker itself, the
  term as its title, and is picked once made. The server decides
  (`page:write` and the namespace's membership): a refusal is said in the
  picker, which stays open.
- **The surface.** A large dialog whose search field stays in place while only
  the list scrolls; on the phone shell a tall sheet of its own — or, inside a
  sheet already (a block's settings on a phone), a page of that sheet; the
  editor's link picker is a popover under the toolbar. Escape clears a typed
  term, then closes (the link picker's hands the caret back to the text);
  ↑/↓ and Enter work from the field.

It asks `/api/node-search` with `types`, the node picker's half of the
endpoint (`search/nodeSearchParams.ts` reads the request once):

| Parameter | Value | Meaning |
|---|---|---|
| `q` | text | the term a title holds |
| `types` | `page,document,collection` | the types searched (unknown ones ignored) |
| `limit` | 1–50, default 12 | the page size |
| `offset` | 0–1000 | where the page starts |
| `exclude` | node ids, at most 50 | never listed (a collection is not offered to itself) |
| `recent` | `1` | with no term: the nodes the viewer worked on last instead of the most recently changed |

The answer is the page (`results`: each node's type, id, title, slug,
address, namespace and integration), whether `more` follow, and `exact`: the
types searched that have a node titled exactly as the term. A request
without `types` is refused (400).

## Related pages

- [dynamic-rendering.md](dynamic-rendering.md) — the query model, query blocks and the list query.
- [languages.md](languages.md#search) — full-text matching in every content language.
- [semantic-layer.md](semantic-layer.md) — classes and their hierarchy, tags.
- [authorization.md](authorization.md) — the visibility predicate and namespace access.
- [routing.md](routing.md) — `search` as a reserved word.
