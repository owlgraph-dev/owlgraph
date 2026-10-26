# A request, from address to page

One request for a page — `GET /handbook/onboarding`, the page `onboarding` in
the namespace `handbook` — followed from the moment it reaches the app to what
the browser shows, with the module that does each step. Each step's own page
has the detail; this one is the order they run in.

## 1. The hook

`src/hooks.server.ts`'s `handle` runs first, for every request:

- It gives the request an id and a logger, and logs the request when it ends
  ([logging.md](logging.md)).
- Sign-in attempts and GraphQL requests pass their rate limits before anything
  is looked up.
- The session cookie becomes `locals.user` (`getSessionUser`). The response
  gets a fresh style nonce (`locals.styleNonce`), and the viewer's colour
  preference is read from its cookie.
- **The sign-in gate.** A route outside `PUBLIC_ROUTES`
  (`src/lib/shell/publicRoutes.ts`), requested without a session, is answered
  here: `/api/` routes with a 401, others with a redirect to `/login`. The read
  route is public, because whether a page needs a session depends on the page
  ([authorization.md](authorization.md#the-route-level-gate)).
- **The interface language** is decided from the user's profile, the cookie,
  `Accept-Language` and the site's enabled languages (`resolveUiLocale`), and
  handed to Paraglide ([Languages](languages.md#the-interface-language)).

The route then resolves (steps 2 to 5), and the hook finishes the response:
it fills the HTML's `lang`, `dir` and colour preference, writes the style half
of the content security policy for this route's class — the nonce on a
reader's route ([Content Security Policy](overview.md#content-security-policy))
— and sets `nosniff`, the framing and referrer policies, and
`private, no-store` on any response to a signed-in viewer.

## 2. The route

The address matches `src/routes/[[namespace=namespace]]/[slug]/`: an optional
namespace segment, then the slug. The `namespace` matcher
(`src/params/namespace.ts`) accepts the first segment only if it is a known
namespace's slug, from an in-memory registry; otherwise the address belongs
to the default namespace, which has no prefix
([routing.md](routing.md#the-routing-ambiguity-and-the-params-matcher-that-resolves-it)).

The route's `+page.server.ts` is an adapter of one line: it re-exports the
reader feature's `load` (`src/lib/features/reader/routes/read.server.ts`).

## 3. The node, and whether this viewer may read it

The load resolves the namespace and the node by its slug (unknown: 404), and
branches on the node's type: a page, a collection or a document. For a page
it asks `userCanReadPage`, which is the role check and the node check
([authorization.md](authorization.md#two-checks)). A page the viewer may not
read answers 404, unless the viewer is signed out and the page is open to
every signed-in user: then they are sent to sign in, and come back to it.

## 4. Rendering for this reader

`renderPage(page, reader)` (`src/lib/features/reader/renderPage.server.ts`)
renders the page for one reader — here a visitor, with their user, if any,
and their interface language. The renderer walks the document synchronously,
so everything that depends on the viewer is resolved first, as the viewer:

- the slugs of the pages and documents the text links to;
- each query block's results, in the page's content language
  ([dynamic-rendering.md](dynamic-rendering.md));
- the embedded collections and documents, and a plugin block's data
  ([Collection and document blocks](blocks/node-embeds.md#collection-and-document-blocks));
- the site's fonts, paragraph styles, named styles, capability defaults and
  the stored sizes of the page's images.

Then `renderDoc` (`content/render/render.server.ts`) walks the document. Each
block's renderer (`content/blocks/<kind>/render.ts`) writes its HTML and
registers its override set with the render's `StyleCollector`, which answers
with the id the element carries as `data-b`; a block drawn by a Svelte
component renders through `ssrBlock`, and one with behaviour on the page
gets an island marker ([Svelte leaf blocks](blocks/anatomy.md#svelte-leaf-blocks)).
The result is the HTML, the collector's CSS, the image to preload, and the
rule ids of the canvas and of the reading area around it.

## 5. The layout and the page

The root layout's load (`src/lib/shell/layout.server.ts`) runs beside the
page's, for every page: the navigation and the footer as this viewer may see
them, the namespaces they may see, the site theme, the fonts and the custom
stylesheet's address.

The page component (`+page.svelte`) puts the page's CSS into the head as one
`<style>` under the response's nonce, preloads the image the page opens with,
and draws the HTML in `RenderedContent`. The root layout adds the site theme
— the colour schemes and the content's defaults — and the fonts as further
nonce'd stylesheets, and frames the page with the app bar and the footer. No
element carries a `style` attribute
([decision 0007](../adr/0007-styles-reach-a-page-through-a-per-page-stylesheet.md)).

## 6. In the browser

- Before hydration, `src/hooks.client.ts`'s `init()` loads the namespace
  slugs, so the client router resolves the address to the same route the
  server did.
- `RenderedContent` hydrates the islands — a quick link's card, a diagram,
  which draws in its frame — and nothing else of the content runs client
  code.
- A navigation into a route with the other style policy, such as the editor
  or Settings, is a full page load, so each document keeps the policy it was
  served with.

## Other readers

The same render serves the other ways a page is read:

- **A share link** (`/share/[id]`, `reader/routes/share.server.ts`): the
  reader is anonymous whatever their session, and links resolve only to what
  an anonymous reader could follow — the link grants its page, not what the
  page embeds.
- **An agent** (MCP's `get_page_html`): the reader is the token's user, the
  page has no canvas around it, and no plugin's service is read live
  ([mcp.md](mcp.md)).
- **The editor** draws the same blocks with the same components and the same
  stylesheet, so its canvas matches the page
  ([Editor vs. public render](overview.md#editor-vs-public-render--and-why-they-must-match)).

## Related pages

- [Architecture overview](overview.md) — the stack, the node model and the
  code layout this request runs through.
- [routing.md](routing.md), [authorization.md](authorization.md),
  [Blocks](blocks/overview.md) — the steps in detail.
