# Writing a plugin

A plugin adds to owlgraph through the
[Plugin Interface](../architecture/plugins.md#the-plugin-interface): block
kinds, settings, sources that back collections and documents, routes, and
connections to another service. A plugin that interacts with owlgraph only
through that interface may be licensed as its authors choose
([decision 0014](../adr/0014-agpl-with-a-plugin-exception.md)).

**The interface is experimental.** This guide describes its first version,
shaped by the one plugin that ships with owlgraph, and it changes with the
interface. There is no example plugin to copy: the **Nextcloud plugin**
(`src/lib/plugins/nextcloud/`, [its page](../architecture/nextcloud.md)) is
the worked example throughout, and every file this guide names is a real one.

## Before you start

- **Where a plugin lives.** In this release a plugin is a directory
  `src/lib/plugins/<id>/` in the repository, registered by one line in each
  registry file it has a half for. Where plugins come from and how they load
  is still open ([plugins.md](../architecture/plugins.md#the-plugin-interface)).
- **What to read.** [plugins.md](../architecture/plugins.md) — the contract,
  the registry, the server half, the boundaries — and
  [Block anatomy](../architecture/blocks/anatomy.md), which a plugin's blocks
  follow as the core's do.
- **The rules it is held to**, by `npm run check`
  ([Boundaries](../architecture/plugins.md#boundaries)): only the registry
  imports a plugin; a plugin imports the core through an allowlist; the core
  never names a plugin; no import leads back to the registry that loads it.
  A plugin keeps no tables of its own: what it stores goes through the host
  ([decision 0012](../adr/0012-a-plugin-keeps-its-state-in-the-hosts-seams.md)).

## A plugin's files

A plugin contributes in halves, one per audience, so each half reaches only
the bundle that needs it ([The contract](../architecture/plugins.md#the-contract)):

```
src/lib/plugins/<id>/
├── index.ts           the manifest (definePlugin): id, label, block kinds, settings, connections, sources
├── messages.ts        its texts, one dictionary per language (pluginMessages)
├── blocks/<kind>/     one folder per block kind, after the block anatomy
│   ├── model.ts       the kind: its catalogue row, facets and sample; its attrs, checked
│   ├── view.ts        the attrs as drawn: the wrapper, the override sets, the props
│   ├── <Kind>.svelte  the look: the NodeView's, the page's and an island's
│   ├── tiptap.ts      the Tiptap node and its NodeView (svelteNodeView)
│   └── render.ts      the page render (ctx.ssr inside wrapperHtml)
├── blocks.css         its blocks' stylesheets
├── renderers.ts       definePluginRenderers: a renderer per block kind
├── editor.ts          definePluginEditor: per kind its node, label, Insert entry and settings sections
├── islands.ts         the components the page hydrates, if any
├── inputs.server.ts   definePluginInputs: the kinds agents may write, if any
├── nodeViews.ts       definePluginNodeViews: the body of its nodes' own pages, if any
└── server.ts          definePluginServer: its routes, block data, settings checks and sources, if any
```

A plugin that adds a block needs the manifest, its texts, the block's folder,
the renderers, the editor half and the stylesheet. Its id is lowercase, and is
also its directory's name, its name in the boundary check and the `plugin` of
the nodes its source backs.

## Adding a block, step by step

Each step names the file of the Nextcloud **file block**
(`src/lib/plugins/nextcloud/blocks/file/`), which shows one document as a row
or a card.

1. **The kind** (`model.ts`). The stored name, `nextcloudFile` — frozen from
   the first page that stores one
   ([Frozen identifiers](../architecture/blocks/anatomy.md#frozen-identifiers));
   the catalogue row `fileKind`: its group, whether it is addressable and
   spaced, the family of node it embeds; its facets — a summary for agents,
   the edges it adds to the graph, the ground it paints; and a sample node,
   which the contract test renders. `fileConfig` reads the stored attrs
   back, with a default for anything missing or malformed, and `newFileNode`
   is the node the Insert menu adds. The manifest reads this file, so it
   imports nothing at runtime from outside the plugin.
2. **The manifest** (`src/lib/plugins/nextcloud/index.ts`): `definePlugin`
   with the id, the label and the block kinds — and, for a plugin that has
   them, its settings fields, connections and sources.
3. **The texts** (`src/lib/plugins/nextcloud/messages.ts`): `pluginMessages`,
   every key in every language the app speaks. `t(key)` speaks the interface
   language, `t.in(locale, key)` a given one, such as a page's content
   language ([Languages](../architecture/languages.md)).
4. **The look** (`view.ts`, `FileCard.svelte`). `view.ts` turns the attrs
   into what is drawn — the wrapper, with the block id and the override sets
   of its space above and its placement; the box's own override set; the
   component's props — and both the editor and the page use it, so they
   cannot disagree. The component takes plain JSON props and never a `style`
   prop ([Svelte leaf blocks](../architecture/blocks/anatomy.md#svelte-leaf-blocks)).
5. **The page** (`render.ts`). The renderer reads what the server resolved for
   this reader from `ctx.blockData`, registers the box's override set with
   `ctx.styles`, and renders the component through `ctx.ssr` inside
   `wrapperHtml`. `src/lib/plugins/nextcloud/renderers.ts` gives each of the
   manifest's kinds its renderer; one missing does not compile.
6. **The editor** (`tiptap.ts`, then `src/lib/plugins/nextcloud/editor.ts`).
   The Tiptap node declares the block's attrs (`dataAttr`, and the
   capabilities' own attrs), mounts the component with `svelteNodeView`, and
   names its capabilities in `addStorage`
   ([Adding a block kind](../architecture/blocks/anatomy.md#adding-a-block-kind)).
   The editor half gives each kind its node, its label, its Insert-menu entry
   and its block settings sections — components that draw a section's rows,
   while the panel draws the frame
   ([What a plugin block builds on](../architecture/plugins.md#what-a-plugin-block-builds-on)).
7. **The stylesheet** (`src/lib/plugins/nextcloud/blocks.css`): the plugin's
   sheet imports each block's, in the content's layers, under class names of
   the plugin's own (`nc-file-block`). A plugin module never imports a
   stylesheet: the renderer also runs under plain Node.
8. **What agents may write**, if anything
   (`src/lib/plugins/nextcloud/inputs.server.ts`): the zod shape the MCP tools
   check, with a `kind` no other input uses (`nextcloud-file`), the node it
   becomes, and its paragraph in `append_block`'s description
   ([What an agent may author](../architecture/plugins.md#what-an-agent-may-author)).
9. **Data from outside the document**, if the block needs it
   (`blockData.server.ts`): resolved by the server half for each reader before
   the page renders ([Block data](../architecture/plugins.md#block-data)).

## Registering it

Each registry file directly in `src/lib/plugins/` has one line per plugin —
the Nextcloud plugin's shows the form — and a new plugin adds its own to each
file it has a half for: `index.ts`, `renderers.ts` and `editor.ts` for a
block, and as needed `islands.ts`, `nodeViews.ts`, `inputs.server.ts`,
`server.ts` and `blocks.css`
([The registry](../architecture/plugins.md#the-registry)). Its server code
lives in `*.server.ts` modules, reached from its `server.ts`.

An admin turns the plugin on in Settings → Integrations; a plugin with
settings gets its section there.

## Checking it

- **`npm run check`**: the types, and the boundary rules over the plugin.
- **The contract** (`src/lib/plugins/contract.test.ts`, in `npm test`): every
  plugin directory registered under its name; each block kind added once, with
  a renderer and an editor half; its sample rendering on a page as an
  addressable block without a style attribute; its settings keys distinct, at
  most one origin; its routes well formed and distinct.
- **Its own tests** live in its directory, each at the lowest layer that can
  observe its behaviour ([testing.md](testing.md)). Its end-to-end specs go
  in its `e2e/` folder, a journey as `e2e/journey-<name>.spec.ts`, since the
  core's tests never name a plugin.

## Beyond a block

| A plugin that | Reads | In the Nextcloud plugin |
|---|---|---|
| has settings | [Settings](../architecture/plugins.md#settings) | the server address and the cache time, in its manifest |
| backs collections or documents with another service's content | [Sources](../architecture/plugins.md#sources) | a public share's folder as a collection, its files as documents |
| serves routes of its own | [Routes](../architecture/plugins.md#routes) | the listings and file contents its blocks load |
| lets a reader open what it serves | [Grants](../architecture/plugins.md#grants) | a file opened through a grant of the reader's own |
| connects a person's own account | [Connections](../architecture/plugins.md#connections) | Login Flow v2 and an app password ([decision 0013](../adr/0013-nextcloud-connections-use-login-flow-v2.md)) |
| draws the body of its nodes' own pages | [Node views](../architecture/plugins.md#node-views) | a mirrored collection's page |

What the server half runs against is [the host](../architecture/plugins.md#the-host).

## Removing a plugin

Turning a plugin off keeps its kinds known: its blocks stay in the schema and
show their turned-off state. Removing it — deleting its registry lines and its
directory — makes its blocks **unknown blocks**
([Unknown blocks](../architecture/blocks/anatomy.md#unknown-blocks)): every
page keeps them exactly as they were, the editor shows each as a block it
can't read (to move, or to delete on purpose), the page shows nothing of
them, and they come back to life if the plugin returns. So retiring a plugin
needs no data migration — but the search index holds what a page said when it
was last saved, so run `npm run db:backfill-search` once the plugin is gone,
and what its blocks held leaves search at once rather than at each page's
next save.

When a plugin leaves, move its block kinds into `RETIRED_BLOCK_KINDS`
(`src/lib/plugins/index.ts`: the kind, the plugin's id and the kind's name per
language) — pure data, no code of the plugin — so its unknown blocks say
whose they were ("Block of an unavailable plugin: Nextcloud folder") instead
of only their node type. There is no script that removes its blocks from
every page for good; one would run with a backup first.
