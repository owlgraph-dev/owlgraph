# Custom styles

Styling an admin defines for authored content: a registry of **named styles**
the app knows by label, plus a **free CSS** escape hatch, compiled into one
content-scoped stylesheet per scope and served same-origin. Managed under
Settings → Appearance → Custom styles ([settings.md](settings.md)).

The colour vocabulary these styles are written in is the content palette
(`--content-*`, [theming.md](theming.md#content-palette)).

## Two tiers, structured first

A **named style** is something the product knows about: a stable id, a fixed
`slug` rendering as the class `cs-<slug>`, an editable `label`, a `kind`
(`inline` for a run of text, `block` for a whole block) and a CSS
**declaration body**. Because the app knows them, it can offer them by label.

**Free CSS** is whole rules, per stylesheet, for the overrides and corrections
a named style cannot express. It is admin-only and is never offered for
selection — the same relationship the HTML block has to the block model:
structured first, raw as the escape hatch.

The alternative — parsing a CSS file for its class names — was rejected: it
yields an unlabelled, purposeless list that nothing can present meaningfully.

## Content scope is the security boundary

**Every compiled rule is nested under the content root, `.page-canvas`.**
Custom CSS can restyle page content and nothing else: not the app bar, not
settings, not a dialog, not the sign-in page. Chrome overrides are not
offered and never will be.

This is a security property, not a tidiness one. The compiled sheet is served
to anonymous readers, and CSS is an attack surface without JavaScript
(exfiltration through selective loading, overlays that mislead a click), so
"only admins can write it" is not the control. The compiler is. Three things
enforce it, in `features/site/customStyles/compile.ts`:

1. A named style's CSS is a declaration body, parsed inside a wrapper rule.
   The wrapper must come back as the entire document — postcss is lenient
   enough to read `color:red} .app-bar{…}` as two rules, so a body that closes
   its own rule is refused rather than quietly becoming a rule nobody wrote.
2. Every selector is rebuilt with the content root in front of it — top level,
   nested, and inside `@media` / `@container` / `@supports` alike. The prefix
   is what bounds it: `:is(html, .app-bar)` survives as
   `.page-canvas :is(html, .app-bar)` and can only ever match inside content.
3. The emitted text is re-parsed and every selector re-checked before it is
   returned. A transform bug fails closed instead of shipping an escape.

`.page-canvas` is the one root because every surface has it: the public page
and the share route render `article.prose.page-canvas` around a
`div.canvas-blocks`, the desktop and phone editors `div.editor.page-canvas`
wrapping the ProseMirror
`.canvas-blocks`, and query blocks render inline in that same tree. It is
ancestor-or-self of the blocks container everywhere, so one prefix covers
reader and editor alike. `.prose` is public-only and must not be used.

`html`, `body` and `:root` are the document in the CSS an admin knows; inside
a page they mean the canvas, so a leading one of them is dropped and the rule
lands on the content root itself — `body { background: … }` paints the page
ground rather than becoming a rule that can never match.

## What the compiler refuses

Validation is a real parse (postcss), never a regular expression over source
text. A stylesheet that fails any of this is refused at save, with the line
the admin wrote:

- **At-rules**: `@media`, `@container`, `@supports` and `@keyframes` are
  allowed. Everything else is refused — imports, `@font-face` (fonts are
  uploaded under Settings → Fonts, where they are served same-origin),
  `@charset`, `@namespace`, `@page`, `@layer`, `@scope`.
- **Declarations**: `position: fixed` (it would place an element outside the
  content area), a `z-index` outside −1…100, `expression()`, `behavior` and
  `-moz-binding`.
- **`url()`**: same-origin paths beginning `/` and same-document fragments
  beginning `#` only. Another origin, a protocol-relative `//`, and `data:`
  are all refused.
- **Selectors**: a leading combinator, and `&` at the top level.

`!important` is allowed: the output is content-scoped, so there is nothing
outside content for it to win against. Inside content it is the one thing
that beats a block's own overrides — a per-page rule is unlayered and an
`!important` declaration in a layer still outranks it, exactly as it
outranked the inline attribute before ([blocks/capabilities.md](blocks/capabilities.md#override-sets-and-the-carrier)).

**Keyframe names are namespaced per stylesheet** (`cs-<sheet>-<name>`), and
the `animation` / `animation-name` declarations referring to them are
rewritten. Keyframe names are global: without this, two stylesheets animating
`fade` would collide, and a `@keyframes ds-spin` written in content would
retarget the design system's Spinner.

## Names, and why the class never changes

Content refers to a style by its **id**. The **slug** is derived from the
label when the style is created and is fixed from then on; the **label** is
free to change. A class that followed the label would silently unstyle every
page using it the moment someone renamed it.

The slug is unique across every stylesheet, not per sheet, because `cs-<slug>`
is one global name in rendered content — two sheets can never claim the same
class, and content stays readable wherever it is embedded. A label whose slug
is taken gets the next free numeric suffix, which the admin sees before
saving.

A deleted style leaves its class behind on the content that used it, rendering
unstyled. That is deliberate: content stays valid, nothing blocks a delete,
and nothing has to be rewritten.

## Applying a style

An editor selects a run of text and picks a style from the toolbar's Text style
picker (a bottom sheet on a phone). The picker offers the `inline` styles of
enabled stylesheets, by label; one style at a time, because a second replaces
the first the way the typography marks do. It is the inline axis: what a
whole text block *is* and looks like is its paragraph style, picked from the
Paragraph style menu beside it ([typography.md](typography.md#paragraph-styles)),
and a paragraph style's look is never applied as a mark.

**Content stores the style's id, never its class.** The `customStyle` mark
carries `styleId`; the class is looked up at render time, by the editor's mark
and by the server walker alike. Two things follow, and they are the reason for
the indirection:

- Renaming a style cannot break a page. The label is free to change, the slug
  never changes, and nothing stored has to be rewritten.
- A class can never arrive from content. `PUT /api/pages/[id]` does not validate
  marks, so a stored `styleId` may be anything; it is only ever a lookup key,
  and one that resolves to nothing produces no class — which is exactly what a
  deleted style does, leaving the run unstyled rather than erroring.

That is a stronger guarantee than an allowlist over the sanitizer, and it is why
the sanitizer needs no rule for this: a mark lives in ProseMirror JSON, and
`sanitizeDoc` rewrites only an html block's own HTML and a link mark (its href,
and nothing else kept) — a custom-style mark passes as it came.

The registry reaches the two paths differently, following the arrangement fonts
already use: the browser holds it in a module value the root layout sets
(`content/inline/customStyleRegistry.ts`), because Tiptap's `renderHTML` takes no
parameters and one tab has one editor; the server takes it as an argument to
`renderDoc`, because that pipeline is shared across concurrent requests and
stylesheets are scope-bound. Both are fed from `listCustomStyleRefs()`, which
builds the class beside the compiler that writes the matching selector, so the
two cannot drift.

In the **html block**, the same styles are offered as classes to insert at the
caret — both kinds, since an author's own markup may want a block class on a
wrapper. The sanitizer already allows `class`, so nothing there changed.

Agents get the vocabulary from the `list_custom_styles` MCP tool, and the html
block's schema and `append_block` both point at it before raw CSS.

## Compile, cache, serve

All enabled stylesheets of a scope compile, in `position` order, into one
artifact: each sheet's named styles in their own order, then that sheet's free
CSS — so an admin can override a named style from the same sheet's escape
hatch. `enabled` is the kill switch: turning it off removes the whole sheet
from the artifact on the next render.

The result is cached by a version read from the rows (their count and newest
`updated_at`, so saves, toggles and deletes all register), the same
no-invalidation design the site theme uses
([theming.md](theming.md#emission)): a save changes the version, the next
render is a new cache key, and no process has to be told anything.

It is served from `/api/styles/site/<hash>`, where `<hash>` is the artifact's
content hash, and linked from the root layout's head. A link rather than an
inline `<style>` because:

- it satisfies `style-src 'self'` on its own, no nonce needed
  ([architecture/overview.md](overview.md#content-security-policy));
- the content hash makes it immutably cacheable, so it is fetched once rather
  than re-sent inside every document;
- one link in the root layout covers every surface that layout wraps — reader,
  share route and editor — which is what makes the two render paths show the
  same thing.

A request for a hash that is no longer current still gets the current bytes,
without the long cache: an open tab keeps working rather than seeing a 404.

The artifact is wrapped in the `custom` cascade layer
([design-system/tokens.md](design-system/tokens.md#cascade-layers)): above the theme and
the component CSS whatever an admin's selectors weigh, below a block's own
overrides. The compiler itself keeps rejecting `@layer` in a sheet's source;
the wrapper is added where the artifact is assembled, and the settings
preview wraps its draft the same way.

The route is public and unauthenticated, because anonymous readers render page
content too. It carries nothing viewer-scoped: one artifact, compiled from
what an admin wrote, identical for everyone.

## Writing a style

The settings page runs the very same compiler in the browser, so the preview
and the errors under the CSS field are not an approximation of a save — they
are the save's own answer. It is fetched on demand rather than imported
outright: postcss is not side-effect-free, so a plain import would travel with
the components barrel and land on every page of the app, public reader pages
included. `customStyles/load.ts` is the one way in, and
`scripts/check-boundaries.mjs` fails the build if anything reaches the
compiler eagerly from a client entry point.

postcss's own package.json marks its source-map dependencies (`path`, `fs`,
`url`, `source-map-js`) unusable in a browser. Rollup honours that, so the
built client carries no reference to them; Vite's dev dependency optimizer
does not, and substitutes a shim that warns on every property read — a dozen
lines in the console just for loading the compiler. `vite.config.ts` applies
the mapping the optimizer skipped, for imports from inside postcss only.

Named styles should read `--content-*` tokens
([theming.md](theming.md#content-palette)). A token resolves per scheme, so
one style works on a light page, a dark page and inside a scheme region; a
literal colour cannot. The CSS editor offers the tokens, including the site's
brand colours, and flags a literal colour as a warning rather than an error —
a fixed colour is allowed, it just has a consequence.

A font size in a style reads a type-scale step, `var(--type-<step>)`
([typography.md](typography.md)), which the CSS editor offers beside the
colour tokens: it follows the reader's font-size setting, and the large steps
shrink on a narrow canvas. A `px` size stays allowed, as a deliberate fixed
size.

An `inline` style that paints a literal background is also checked against
both schemes' page text: if the text that will sit on it falls below 4.5:1,
the editor says so under the field. A style that sets its own text colour is
checked as that pair instead, which is the same on every page.

Both are warnings. A band with its own text colour is a fair use of a literal.

## Scope model

`stylesheets` sits on the theme scope model
([theming.md](theming.md#site-theme)):
`scope_kind` is `site` or `namespace`, with a `scope_id` only for the latter,
held by the same biconditional constraint the `themes` table uses. Only site
rows exist; the scope leaves room for a namespace's stylesheet over the
site's, as for a namespace's theme.

## Not offered

- **Chrome or shell overrides.** Never — content scope is the point.
- **Block-level application.** `kind: 'block'` exists in the model and an html
  block may use such a class on its own markup, but the editor does not apply a
  named style to a *block node*: a block's look is its paragraph style
  ([typography.md](typography.md#paragraph-styles)).
- **Custom fonts through CSS.** `@font-face` is refused; fonts are uploaded
  and served through font hosting.
- **Usage counts and delete protection.** Orphans render unstyled instead.

## Related pages

- [theming.md](theming.md) — the content palette, schemes and scheme regions, the colour maths.
- [settings.md](settings.md) — Settings and its per-section permissions.
- [design-system/overview.md](design-system/overview.md) — the primitives the section is built from, including `CodeArea`.
- [migrations.md](migrations.md) — how the schema change was made.
