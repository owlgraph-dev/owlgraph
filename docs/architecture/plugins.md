# Plugins

A **plugin** extends owlgraph with something the core does not know about — an
integration with another service, the blocks that show it — without the core
ever naming it. What makes it a plugin is the seam: the core offers
contribution points, a plugin fills them, and the build fails when either side
reaches past the seam ([Boundaries](#boundaries)). The plugins that ship with
owlgraph live under `src/lib/plugins/<id>/` and are built with the app.

## The Plugin Interface

> Decision: [0014. AGPL-3.0-only with a plugin exception](../adr/0014-agpl-with-a-plugin-exception.md).

[`PLUGIN-EXCEPTION.md`](../../PLUGIN-EXCEPTION.md) lets a plugin, and a client
that talks to owlgraph over the network, be licensed as its authors choose, as
long as it uses owlgraph only through the **Plugin Interface**: the interfaces
this section designates as public. For this release they are:

- **The contract:** a plugin's manifest and the definitions it declares its
  parts with, meaning the `definePlugin…` functions, `pluginMessages` and the
  types they take and return, in `src/lib/plugins/api.ts`
  ([The contract](#the-contract)).
- **The plugin loading mechanism:** the way owlgraph finds a plugin and loads
  its parts. This release loads the plugins it is built with, through the
  registry ([The registry](#the-registry)). Whatever a release uses to load
  plugins, whether they ship with owlgraph or come from elsewhere, belongs to
  this interface.
- **The extension points this page describes,** with what each one is handed:
  - block kinds, with their renderers, islands and stylesheets;
  - node views;
  - the editor half and its block settings sections;
  - agent inputs;
  - the server half, through the host: routes under `/api/plugins/<id>/`,
    settings, sources, grants, connections and block data.
- **What a plugin may use of owlgraph's code:** the modules the boundary check
  allows it ([Boundaries](#boundaries), rule 8), meaning the contract, the
  content feature's index, editor and listing entries, the design system's
  barrel and icons, HTML escaping and localized text.
- **The public network API:** the GraphQL API at `/api/graphql`, the agents'
  MCP server ([mcp.md](mcp.md)), and the HTTP endpoints under `/api/` that
  these docs describe.

Everything else is internal, even where it can be reached: the other features
and their modules, the shell, the database and its tables, and the pages' own
form actions and data requests.

**Experimental.** This is a first version of the interface, shaped by the one
plugin that ships with owlgraph. Where plugins come from, how they are loaded,
the interface's shape and how stable it is are all still open, and any release
may change them without a deprecation period. What the interface is for a
release is what this section says in that release (the exception's section 5).

## The contract

`src/lib/plugins/api.ts` is the contract: the shape of each contribution and the
helpers a plugin declares them with. A plugin contributes in **halves, one per
audience**, so each half reaches only the bundle that needs it — the same split
as the content block lists ([blocks/anatomy.md](blocks/anatomy.md)):

| Half | File in the plugin | Holds | Loaded by |
|---|---|---|---|
| manifest | `index.ts` (`definePlugin`) | its id and label, the block kinds it adds — each kind's catalogue row (with the family of node it embeds, if it embeds one), its facets and a sample node — its settings fields, the form that connects a node to its source | everything — pure data |
| renderers | `renderers.ts` (`definePluginRenderers`) | one page renderer per block kind | `renderDoc`: the page, the share link, MCP |
| islands | `islands.ts` | the components its blocks hydrate on the page | the reader's page |
| node views | `nodeViews.ts` (`definePluginNodeViews`) | per node type, the body of its nodes' own pages | a node's own page |
| editor | `editor.ts` (`definePluginEditor`) | per block kind: its Tiptap node, its label, its Insert-menu entry, its block settings sections, how the block settings panel places and surfaces it | the editor |
| inputs | `inputs.server.ts` (`definePluginInputs`) | per block kind an agent may author: the shape `append_block` checks, the node it becomes | the MCP tools |
| server | `server.ts` (`definePluginServer`) | its routes, its block-data resolvers, its settings checks, how its source serves and connects nodes | the server, through the integrations feature |
| stylesheets | `blocks.css` | its blocks' CSS, in the content layers | the editor and the page |

`definePluginRenderers`, `definePluginEditor` and `definePluginServer` take
the manifest, so a renderer or editor half that misses one of the manifest's
block kinds does not compile, and a server half resolves data only for kinds
the manifest adds. The contract names two further points — MCP tools, query
sources — that are typed as empty: no plugin fills them. A plugin's
blocks an agent may author are its inputs ([What an agent may
author](#what-an-agent-may-author)).

A plugin's **texts** are its own dictionaries (`pluginMessages`, one per
language the app speaks, each holding every key of the base language), never
the core's message catalogues: `t(key, params)` speaks the current language,
`t.in(locale, …)` a given one — a block's text rendered into a page speaks the
page's content language ([languages.md](languages.md)).

## The registry

The core reaches the plugins through **registry files**, directly in
`src/lib/plugins/`, one per audience and one line per plugin in each:
`index.ts` (the manifests), `renderers.ts`, `islands.ts`, `nodeViews.ts`,
`editor.ts`, `inputs.server.ts`, `server.ts` and `blocks.css`. They are the only core modules that import a
plugin, and in this release their static lists are how the core finds its
plugins.

Each core list reads its registry:

- the content catalogue (`content/blocks/catalog.ts`) appends the manifests'
  block kinds to its own, so every set derived from it — which kinds carry a
  block id, take space above, count as structural — covers them;
  `facets.ts` reads their facets beside the core's, so search, the graph and
  `get_page` ask a plugin block what they ask any other;
- the public render table (`content/blocks/renderers.ts`) spreads the plugins'
  renderers, keyed by the same names, so a plugin block without a renderer does
  not compile;
- the page's island list (`content/blocks/islands.ts`) spreads their islands, and
  `content/blocks/blocks.css` imports the registry's sheet last;
- a collection's own page draws the body its integration's node views give
  the type ([Node views](#node-views));
- the editor core mounts their Tiptap nodes beside the core blocks', and the
  editor's catalogue, the block settings panel, the breadcrumb and the Insert menu read
  their editor halves;
- the settings tree gives each plugin with settings a section under
  Integrations ([settings.md](settings.md#the-integrations-group)), and the
  pluginHost feature reads the server halves ([The server half](#the-server-half)).

The editor half is composed by the editor feature, not by content's block list:
a plugin's NodeView imports content's editor entry, which re-exports that list,
and the two would load each other.

## What a plugin block builds on

A plugin block follows the Svelte block contract
([blocks/anatomy.md](blocks/anatomy.md#svelte-leaf-blocks)) with the same helpers as a core
block, reached through the content feature's entry points: the render contract
(`BlockRenderer`, `RenderContext`), the block wrapper (`wrapperHtml`, `applyWrapper`),
the island marker and the attrs a copied block carries in data attributes
(`dataAttr`, `textValue`, `flagValue`) from `$lib/features/content`, the NodeView
(`svelteNodeView`) from `$lib/features/content/editor`. Its component is
rendered through `RenderContext.ssr` — the same `ssrBlock` a core block
imports, handed over by the walker, since a renderer outside content must not
import content's server half back. What a block needs from outside the document
reaches it as `RenderContext.blockData`, keyed by block id, resolved for the
viewer before the synchronous render; a block with no entry renders the state
it shows when nothing was resolved.

In the block settings panel, a plugin draws the **rows** of its sections and the panel
draws the frame (`BlockSettingsSection`, id `block:<section>`), so the sections fold
and mark themselves modified like every other, and a plugin never imports the
editor feature. A section gets the target it edits, the editor, the page being
edited and a way to report its popovers (`PluginSectionProps`).

A kind that shows one of the plugin's collections or documents joins that
**family** by its catalogue row — `embeds: { family, nodeAttr }`, the attr
that holds the node ([blocks/node-embeds.md](blocks/node-embeds.md#one-family-in-the-editor)). The
editor then lists it in the Insert menu under the family's heading while the
plugin is turned on, and a core block whose picker is given one of the
plugin's nodes turns into it, keeping its id and its capabilities. Nothing
else of the plugin changes for it: the kind's own picker, sections and render
stay as they are.

## What an agent may author

A plugin's block an agent may append is one of its **inputs**
(`inputs.server.ts`, `definePluginInputs`): the block kind it makes (`block`,
one of the manifest's — so a core kind refusing one of the plugin's nodes
can name the agent's kind that shows it); the zod shape the MCP tools
check it with — an object whose `kind` is the agent's name for the block, a
literal no other block input uses (`nextcloud-folder`) — the node it becomes
as given, sparse, with a fresh block id; the node it becomes once what it
names is read through the plugin's host as the agent writing it, refused
with a sentence for the agent when the agent may not read that, it is not the
plugin's, or the plugin is turned off; and its paragraph in `append_block`'s
description. The registry (`src/lib/plugins/inputs.server.ts`) lists them as
a tuple, which the core joins into its own block taxonomy
(`content/blocks/blockInputSchema.server.ts`), so the union agents write
stays one static type — `append_block`, `update_block` and `set_cell` take a
plugin's kinds where they take the core's, in a layout's cells too
([mcp.md](mcp.md)). The contract test holds every kind distinct, and each
input's `block` one of its own plugin's kinds.

## The server half

A plugin's server code imports no feature. The core hands it a **host**
(`PluginHost`) per request, built by the `pluginHost` feature
(`src/lib/features/pluginHost/host.server.ts`), and every rule the core keeps
for its own routes is kept there, once, whatever the plugin does.

### The host

- **The viewer.** The signed-in user's id, or none: an anonymous visitor, and
  every share link's viewer while the page renders, who sees what anyone may
  — a share link grants its page, not what that page's blocks show — except
  for the one node the link itself grants. What a block's island then asks
  for itself (a folder's listing) it asks as whoever its browser is signed in
  as, like any other request.
- **Nodes.** Only the nodes the plugin's source backs (a document or a
  collection whose `plugin` is the plugin): another source's are neither
  readable nor writable through it, and a malformed id is simply absent. A
  read is checked for the viewer, a write for the writer. The host makes the
  plugin's collections — in the namespace of a page the viewer writes, owned
  by them, their credential sealed beside them when they have one of their
  own — and its documents: members of a collection the viewer writes, holding
  its credential; or, beside a page the viewer writes, documents of their own
  with no credential, which each viewer reads with their own connection. A
  node made this way is never wider than what it is made from: it takes the
  page's own visibility (a member, the collection's), so a share connected
  on a restricted page is restricted too.
  Asking twice for the same file makes one node — one per collection, or one
  per namespace beside a page — decided under a lock on the collection, or on
  the namespace and the file. Whether the viewer may make one beside a page
  (`mayCreateBeside`) is asked before anything goes to the service on their
  behalf, so a caller who may not learns nothing from it — not whether a
  password was right. A
  node's record of its source (`source_ref`) is the plugin's to shape: it
  replaces it as a writer (a new file chosen) or, with what it observed while
  serving a reader, as a reader. A node comes with its address in the app and,
  a document, with its content's — shown and as a download — so a plugin
  links what the core serves without knowing the core's routes.
- **Secrets.** A node's credential is sealed at rest
  ([authorization.md](authorization.md#secrets)) for its node, with the
  address of the service it was made for, and opened only as that node's —
  copied onto another it opens as nothing —, for a viewer who may read it,
  and only while the plugin points at that address: after the address changes
  it is never sent to the new one, and the node is connected anew there. A
  new one is sealed only for a node they write; a member made from a
  collection gets the collection's sealed anew for itself.
- **The viewer's connection** ([Connections](#connections)): their own
  credential at the plugin's service, opened for them alone and only for the
  address it was made against; none for an anonymous visitor or a share
  link's viewer.
- **The network.** One client, pinned to the plugin's origin setting
  ([authorization.md](authorization.md#requests-to-other-services)) — the
  plugin's only network access; none while the plugin is turned off, and none
  for an origin the deployment no longer allows.
- **Responses** under the core's rules: JSON never stored by a cache, a
  redirect only to a path on this app (never cached, no referrer), a file
  under the served-file rules (`platform/servedFile.ts`: nosniff, inline only
  for PDF, plain text, Markdown and raster images, text and images sandboxed,
  never cached), and the same 404 for missing and forbidden.
- **The log**: the catalogue's integration events ([logging.md](logging.md)),
  labelled with the plugin — by node id and operation, never by an address,
  which may carry a credential.

### Routes

`/api/plugins/<id>/…` is one public route id. A plugin declares its
routes — method, path (literal segments and `:name` parameters), handler —
and who may call each: anyone (`public`, for what a public page's readers
use; the handler asks the host about every node), a signed-in user, or a
holder of `integration:manage`. The dispatcher
(`pluginHost/dispatch.server.ts`) enforces that before a route runs:

- every request counts against its client address's budget, an unknown one
  included;
- an unknown plugin, an unknown path, a path segment that is empty or decodes
  to a slash, and a method the route does not take are the same 404;
- `signed-in` needs a session (401), `manage` the permission (403);
- a write's body is JSON or nothing — no form can post it from another site,
  and no script there can without a CORS grant — at most 64 KB, and well
  formed;
- a route that has the service check a credential its caller supplies — a
  share's password — declares it (`checksCredential`), and runs only while
  its caller has failed checks left (`pluginHost/credentialChecks.server.ts`:
  ten in ten minutes, per person; a 4xx answer spends one, a success none).
  A guess costs the person who makes it, never the address every reader
  shares — a service that throttles failed logins by address would otherwise
  slow everyone's reading down for one person's guesses. Connecting a
  collection's source anew (`PUT /api/collections/<id>/source`) counts the
  same way.

The dispatcher's refusals are the API's error body
([routing.md](routing.md#errors)), and so are a route's own:
`host.respond.error(status, code, message?)` answers a code of the plugin's
with a sentence from its dictionary, or one of the core's codes with the
core's sentence when none is given. A connect's refusal
(`PluginConnectResult`) names its code the same way. What a reader's browser
opens — the file proxy's `notFound`, `gone` and `forbidden` — stays a
sentence as text.

### Settings

A plugin that talks to a service declares its settings fields in its
manifest, and the core draws, checks and stores them (site settings, key
`plugin:<id>`) under Settings → Integrations, with the switch that turns the
plugin on. A field is an **origin** — the service's address, a bare
`https://` origin, at most one per plugin, which the host's client is pinned
to — or a whole **number** in a range. Turning a plugin on needs every origin
and `APP_SECRET_KEY`, since what it connects is sealed. The server half may
add its own checks of the values, and a probe of the service at the address
as typed, before anything is saved ("Check connection"). A plugin without
settings is always on and has no network access.

### Sources

What a node's source answers for goes through the core's own routes, which
check the viewer first and then hand over to the plugin:

- a plugin document's content — `GET /api/documents/<id>/content`, and a
  share link's `/share/<id>/content` — is what the plugin's `serveDocument`
  answers, typically a redirect to a grant (below);
- a mirrored collection is connected anew with
  `PUT /api/collections/<id>/source`: the values of the connect form its
  manifest declares — strings, the required ones given — passed to the
  plugin's `connectCollection`, which checks them against its service.

The collection's editor shows its source in a panel of its own: the
integration's name, what `describeCollection` says of the source from the
plugin's record (its name, a fact or two, when it was last checked, what is
wrong with it) and, when the integration offers one, its connect form drawn
from the declared fields — an address, a password that is never shown again.

Search finds a node by what its source says of it too: the plugin's
`searchText` makes plain words from its record and its file — names, never a
credential, no request to the service — and the host keeps them, after the
integration's label in the node's language, in the node's `source_search`
(`integrations/sourceSearch.server.ts`), part of its search metadata
([search.md](search.md#results)), with every write of the node's record:
made, bound anew, checked, observed. `npm run db:backfill-search` asks every
node's plugin again.

### Grants

A page's HTML never carries a viewer's access: it links stable addresses —
the same for every viewer, so a cached page holds nothing personal — which
answer with a 302 to a **grant** minted for whoever followed them: a sealed
token (`signed-url` purpose) naming the plugin, the node, the plugin's own
detail (a path, a file id), five minutes and the viewer. Redeeming re-checks
all of it: the seal, the plugin, the time (past it, a 410 with a plain
sentence), the viewer (a signed-in viewer's grant is theirs alone; an
anonymous viewer's is anyone's, since it only reaches what anyone may read),
and the node's access — or, for a grant minted through a share link, that the
link still exists and still grants the node.

A grant reads with one credential, named when it is minted: the node's own
(`via: 'node'`) or the viewer's connection (`via: 'user'`, its id sealed in).
Redeeming a connection's grant hands the plugin that connection, opened —
and once it is no longer the viewer's active one (disconnected, renewed,
revoked), the grant answers 403 and asks them to renew it; it never falls back
to the node's credential.

### Connections

A person may connect their own account at a plugin's service, once; the
plugin then reads that service as them, and the service keeps enforcing its
own permissions while owlgraph keeps enforcing its namespaces. The manifest
says so in plain data (`connections`: the credential kinds, a line for the
connections page); the server half carries the handshake
(`PluginConnectionFlow`: begin, poll, verify, revoke) — the core runs the
rest: the page a person connects on, the waiting, sealing the credential
([authorization.md](authorization.md#secrets)), the table, the log. The
connect functions alone get a client that may also POST and DELETE at the
service; every other request a plugin makes reads (GET, HEAD, PROPFIND,
SEARCH).

A person connects on their connections page (`/settings/connections`, one
row per plugin that offers connections; [settings.md](settings.md#the-personal-group)),
and the core runs the flow (`integrations/connectionFlow.server.ts`) behind
`/api/connections/<id>` — JSON only, signed in, rate-limited per person, every
row the person's and the session's own:

- **Connect** (`POST`) begins the handshake at the service. The plugin's handle
  is sealed, bound to the session that started it and kept server-side for
  ten minutes (`connection_flows`); signing out ends it. The browser learns
  only where to approve — the service's own page, its address rebased onto the
  configured origin — and opens it in a window of its own.
- **Waiting** (`POST …/poll`): the page asks every two seconds, and picks the
  connect up again after a reload; the server asks the service at most every
  three seconds, one request at a time however many tabs ask (a lease on the
  flow). An approval counts only when the service names the configured host
  and port, at its root — the scheme aside, which a TLS proxy may hide. The
  credential is then verified at the service, sealed for the person, the
  plugin and the origin, and stored with the flow ended, in one transaction; a
  failure on the way asks the service to forget it again.
- **Connected anew**, the person's older connection is replaced — a new row,
  so whatever was keyed by the old one's id dies with it — and the service is
  asked to forget the older credential.
- **Disconnect** (`DELETE`) removes the connection here at once and asks the
  service to forget the credential, at the address it was made for and
  nowhere else. That is best effort: when the service cannot be asked, the
  page says where to remove the access by hand.
- **Check again** (`POST …/check`) asks the service once who the credential is
  — refused, the connection turns revoked; accepted again, active. Nothing
  checks a connection on its own: a refusal counts against this server's
  address at the service.

The account menu links the page while some plugin that offers connections is
turned on. Nothing a plugin's step throws — a connection flow's step, a
block data resolver, a node view, a search text — is logged by its message
(`integrations/pluginFailure.server.ts`): a parser's message quotes what it
read, so only its class, the step and the stack's frames.

During a request the host hands the plugin the viewer's connection
(`host.connection`): its status from the database alone (none, active, or
one to renew), the credential opened (`open()`, null unless it is active and
was made against the plugin's current address), a way to report that the
service refused it (`refused()` — the connection turns revoked, once, logged,
never retried), and the address of the page where the viewer connects or
renews, returning to where they were (`href()`). The plugin builds its own
request headers from the credential; the host never does.

### Block data

Before a page renders, the reader's render (`renderPage`, for the page at its
address and through a share link) walks its document for plugin blocks — at
any depth, a query template's copies once — and asks each kind's resolver
about all of its blocks at once, through a host for the viewer
(`integrations/blockData.server.ts`). The page waits for the answer, so a
resolver never waits on its service: it reads what the plugin already holds
and may start fetching what it lacks without awaiting it. A resolver that
throws costs its blocks their data, never the page.

### Node views

A node's own page is the core's: its header — where the node sits, its class,
its source, who may read it, its fields and tags, what it holds, its
relationships ([semantic-layer.md](semantic-layer.md#a-nodes-page)) — and the
members of a collection. Below the header of a node whose source is a
plugin's, the plugin may draw what the core cannot: a collection's live
contents. It does so in two halves:

- **The server half's `nodeSource.nodeView`**, asked by the read route for the
  viewer before the page renders (`integrations/nodeView.server.ts`), returns
  what the body starts from (`data`, plain JSON, the plugin's own), how the
  node can be read — the words after the plugin's name on the header's source
  chip (`readsVia`, such as "Share") — what the source holds, in a few words
  (`detail`), and the header's actions for this viewer. Like a block-data
  resolver it reads what the plugin already holds and never waits on its
  service; null leaves the page to the core (the plugin turned off). An action
  is words and an address — a path on this app, or an address at the plugin's
  own service (its origin setting), opened in a tab of its own; the core drops
  anything else. A hook that throws costs the page its body, never the page.
- **The node views' component** (`nodeViews.ts`, `definePluginNodeViews`),
  rendered below the header on the server and hydrated with the page, takes
  `PluginNodeBodyProps`: the node (id, title, address), whether the viewer may
  write it, the hook's `data`, the interface's language, and `onChange` —
  called when the body changed what the core shows around it (a document made
  of a file joins the linked documents), so the core reloads the page's data.
  It speaks the interface's language: a node's page is the app's, not a
  page's content.

A collection with a body shows it in a tab, Contents, beside its linked
documents — the members made from its source, which the core lists; without
one (a curated collection, an integration turned off) the members are the
page. The body sits in a query container named as the page canvas is, so a
block's component folds for a phone there as it does on a page. The contract
test holds the two halves together: a plugin's node views draw a type exactly
where its server half resolves one.

A plugin that reads a viewer's own account learns its name at the service
from the host (`PluginOpenConnection.accountLabel`), for that viewer's eyes
alone — "read as Alice Example".

## Boundaries

> Decision: [0012. A plugin keeps its state in the host's seams](../adr/0012-a-plugin-keeps-its-state-in-the-hosts-seams.md).

`scripts/check-boundaries.mjs` (part of `npm run check`) holds the seam, both
ways:

- **Only the registry imports a plugin** (rule 7): no other core module, and no
  core stylesheet's `@import`, reaches into `src/lib/plugins/<id>/`; no plugin
  imports another.
- **A plugin imports the core through an allowlist** (rule 8): the contract,
  the content feature's index, editor and listing entries (its shared
  authored elements, [blocks/anatomy.md](blocks/anatomy.md#shared-listings)), the design system (its
  barrel, its icons, `Icon`), HTML escaping and localized text; the packages
  `svelte`, `@tiptap/core`, `@tiptap/pm` and `zod`; in a `*.server.ts` module
  also `htmlparser2` and the `node:` builtins that do no I/O. It imports no
  stylesheet — the registry's `blocks.css` carries it, and the Node loader
  `renderDoc` runs under elsewhere cannot load one — and never calls `fetch()`
  on the server: the host's client is its network. Each registry's closure
  stays within its audience: the manifests are pure data — no Svelte
  component either, since scripts outside Vite read them — the islands, the
  node views and the renderers reach neither the editor stack nor a `node:` builtin, the
  renderers no stylesheet either (through whichever module would bring one),
  the agent inputs neither the editor stack, a stylesheet nor a Svelte
  component, nothing a browser loads reaches a server-only package, and the
  server halves never reach the editor stack.
- **The core never names a plugin** (rule 9): no plugin's id — matched as a
  prefix, in any case, so a block kind named after it counts — appears in
  `src/` outside the plugin directories and the registry files, in the message
  catalogues, the migrations (whose comments are prose and skipped), the scripts,
  the tests or the root configuration. These docs may name plugins.
- **No module cycle through a registry** (rule 10): a plugin's runtime imports
  never lead back to the registry that loads it.

`src/lib/plugins/boundaries.test.ts` runs the checker on fixture trees, one
violation per rule; `src/lib/plugins/contract.test.ts` holds every registered
plugin to the contract — named after its directory, each block kind added once,
with a renderer and an editor half, its sample rendering on the page as an
addressable block without a style attribute; its settings keys distinct, at
most one origin; its server half's routes well formed and distinct, resolving
data only for its own kinds.

## Adding and removing a plugin

Writing a plugin, registering it, checking it and retiring it are a guide of
their own: [writing-a-plugin.md](../guides/writing-a-plugin.md).
