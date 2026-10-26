# Languages: interface, schema labels and content

> Decision: [0010. English is the base language, and content has a language of its own](../adr/0010-english-is-the-base-language-and-content-has-its-own.md).

owlgraph deals in two languages that are never the same setting:

- the **interface language** (the UI locale) — the language the chrome
  speaks to a viewer: buttons, headings, hints, and the names of the schema;
- the **content language** — the language a page's or document's content is
  *in* (`nodes.locale`). Full-text search, the content's `lang`, and what is
  rendered into the content follow it, never the interface language. A
  German-speaking team maintains English papers; a reader with an English
  interface reads a German page.

No code path takes one for the other. A block's own state is the interface
speaking, not content: what a diagram says until it is drawn, a query
block's "No results" are in the reader's interface language, whatever the
page is in.

## The site's languages

Three sets, each with one source (`src/lib/platform/i18n/siteLocales.ts`):

- **Supported** — the Paraglide catalogues compiled into the app
  (`project.inlang/settings.json`: `en`, `de`). What a localized text may
  store and a node's content may be in.
- **Enabled** — the subset an admin chose (Settings → General →
  Languages, `locale:manage`). What the interface offers and negotiates, what
  a new node or a changed language may be, what the localized-text field
  edits and reports gaps for. Never empty.
- **Site default** — one of the enabled (the app's default is `en`): the
  last step of the interface's resolution, the language every schema label
  must have, and the content language a new node starts in. The default is
  always enabled.

Both live in `site_settings` (`locales_enabled`, `locale_default`). The app
keeps them in an in-process cache, refreshed when the settings page saves and
re-read after a few seconds otherwise; the root layout hands them to the
browser, so `enabledLocales()` and `siteDefaultLocale()` read the same values
on both sides. The MCP process reads them per request. Disabling a language
keeps everything written in it — its translations, the nodes in it — it is
just no longer offered.

## The interface language

Each request resolves it in one order (`platform/i18n/negotiate.ts`), first
match wins:

1. the **account's preference** (`users.locale`) — a signed-in user's choice
   follows them to every device;
2. the **explicit-choice cookie** (`ui_locale`) — what the language picker
   wrote;
3. **Accept-Language**, negotiated among the **enabled** languages only (by
   q-value; `de-AT` matches `de`);
4. the **site default**.

A choice counts only while its language is enabled, and the browser's wish
is consulted only when there is no choice — negotiation never overrides one.
The language picker (the profile page; the account menu for anonymous
visitors) posts to `/api/locale`, which writes the cookie and, for a signed-in
user, the account; the page reloads. Nothing else writes the cookie.

The app decides; Paraglide only carries the decision. `hooks.server.ts`
resolves the language and runs the request in Paraglide's AsyncLocalStorage
through a request whose cookie holds only that decision, so `getLocale()` and
every message speak it in a loader, an action, a GraphQL resolver; `<html
lang>` is the interface language. The browser reads its language back from
`<html lang>` (`hooks.client.ts` overwrites `getLocale()`): Paraglide's own
browser resolution would negotiate over every catalogue and write its cookie on
first use, a "choice" nobody made. The MCP process resolves the same way —
the token owner's preference, then Accept-Language among the enabled, then
the site default.

### Interface strings

Every user-visible string of the core's chrome is a Paraglide message in
`messages/en.json` and `messages/de.json`, with a feature-prefixed
`snake_case` key; a plugin's are its own dictionaries, one per language
(`pluginMessages`, [plugins.md](plugins.md#the-contract)); the design-system layer takes its strings as props
([design-system/overview.md](design-system/overview.md#writing)). Server code returns data and
error codes, and components translate them. The exception is a sentence the
server composes for the person who sent the request: an API error's message
([routing.md](routing.md#errors)), a form action's refusal (the same error
body, `formError`) and a custom-CSS compile issue are messages, rendered
on the server in the request's language (the request runs inside it, above) —
the compiler's issues in the browser's live preview in the viewer's — so the
page shows them as they come. The error page, too, speaks the
interface's words only; the server's error message is for the log. Chrome
dates and numbers are formatted in the interface language
(`platform/i18n/format.ts`).

## Schema labels are localized text

A property definition's label and description, a property group's label and
description, a class's label and description, and a relationship type's
label, description and **inverse label** are admin-written at runtime, so
they cannot be messages. So are the names of two of the site's registries: a
paragraph style's name ([typography.md](typography.md#paragraph-styles)) and
a page layout's name and description
([blocks/layout.md](blocks/layout.md#page-layout-sections)). Each is a `LocalizedText`
(`src/lib/platform/i18n/localizedText.ts`):

```ts
type LocalizedText = Partial<Record<Locale, string>>; // {"en": "Abstract", "de": "Zusammenfassung"}
```

stored as a JSONB object on the entity's own row. An absent key is the only
way to say "not translated": every write is validated
(`localizedText.server.ts` — supported languages only, trimmed, blanks
dropped), so a stored value never carries an empty translation. A
translation in a disabled language is kept. An inverse label stays nullable:
`null` is "this type has no inverse label". Schema labels are interface: they
resolve in the interface language.

### Identity never localizes

Names (`documents:abstract`), group keys, class and relationship-type
slugs and ids are the identity of a schema entity. Everything that refers to
one — a filter condition, a template mapping, a semantic-property mark, a
GraphQL or MCP argument, an export — uses the identifier. A label is
presentation only: translating or renaming it never touches content, and a
query block keeps working in every language.

The same rule decides anything derived from a schema entity: a class keeps
its colour in the graph view in every language because its slot follows the
slug, not the label ([graph-view.md](graph-view.md#colour-size-legend)).

The registries keep to it too: a paragraph style is its id (with its element
and base role), a page layout its id. A block names its style by id, an
agent passes a style's or a layout's id, and a page records its layout by
id; the name a page records beside it (`presetLabel`) is a plain string of
content, matched against every translation of a layout's name.

### One read path: `localize()`

No consumer picks a language out of a `LocalizedText`. It is read through
`localize(text, fallback, locale = getLocale())`, which walks one chain:

1. the requested language,
2. `en` (the common fallback),
3. the site default language,
4. any available translation — supported languages in order, then any other
   key alphabetically, so the choice is deterministic,
5. `fallback` — the entity's **identifier** for a label (a label is never
   empty), `''` for a description.

### Where resolution happens

The data layer returns the stored `LocalizedText`; every surface resolves it
before the data leaves the server:

- loaders get resolved lists (`listNodeClassOptions`,
  `listPropertyGroupOptions`, `listPropertySuggestionOptions`,
  `getNodeClassFields` — the document editor's and read view's field labels
  come from the last one);
- `/api/relationship-types` resolves labels and inverse labels;
- the graph's and the query layer's view models (edge labels, edge property
  labels, a result's class name) resolve with `labelCache()`, once per
  distinct entity in a result set;
- the paragraph styles' render registry (`getParagraphStyles`, read by the root
  layout and every render) carries each style's name resolved;
- GraphQL resolvers and MCP tools resolve per field (below).

So a component receives a plain string. The exceptions receive the maps and
resolve for display with the same `localize()`: the settings pages that edit
them (the schema catalogues, the paragraph styles under Branding, the page
layouts), and the editor's Page layout picker, which matches a page's
recorded layout name against every translation. The semantic feature's `localizeSchema.ts`
holds the shared mappers. There is no schema cache to keep per language: the
catalogues are read per request. A language switch reloads the page, so the
client-side caches (the relationship-type catalogue, the editor's
property-pill labels) never mix languages.

**Sorting** follows the resolved label: class-tree siblings, the group and
relationship-type pickers, the graph legend. A settings table keeps the
order of its identifier column.

### Editing and gaps

`LocalizedTextField` ([design-system/primitives.md](design-system/primitives.md#localizedtextfield))
is the one control, used through the semantic feature's `LocalizedField` (which binds it
to the site's languages): one line, a language select and the input for the
chosen language — however many languages are enabled. It holds the whole
map, so switching never loses an edit; every language still posts its own
input, `<name>.<locale>`, which the settings actions read back with
`localizedTextFromForm`. A translation in a disabled language is posted
hidden and kept. A **label requires the site default language**; a
description and an inverse label are optional as a whole; a description is
multiline.

Gaps stay visible without opening the select: each option carries its state
(required, missing, done), a badge beside the row counts the translated
languages while one is missing, and an empty language can be filled from the
English text with one click. Each schema settings table shows a "missing"
badge on a row whose label lacks an enabled language (or whose description
or inverse label has text in some language but not in another — an optional
field that is empty everywhere is not a gap), with a filter narrowing the
table to those rows. The table search matches the identifier and every
language of the row's names. The paragraph-style and page-layout tables carry
the same badge, without the filter.

### Seeded schema

The schema the app ships with — the `core` and `documents` groups, the
`documents:` fields, the core classes `node`, `page`, `document` and
`collection` — is seeded in every supported language. The migrations seed
the database (the baseline's seed rows);
`src/lib/features/semantic/schemaSeeds.server.ts` is the runtime twin used
after a test truncate (`ensureCoreClasses`, the e2e reseed). The two are kept
in step.

The seeded paragraph styles and page layouts are named in English and German
the same way (the baseline's seed rows; the runtime twins are
`SEED_PARAGRAPH_STYLES` and `SEED_PAGE_LAYOUT_PRESETS`).

## Content language

Every node has one (`nodes.locale`): an enabled language when it is set. A
new node starts in the **site default** — every node is created through
`insertNode`, the one place that applies it — and an editor changes it in
the properties dialog ("Content language"); MCP has `create_page` /
`create_document_link` (`locale`) and `set_page_locale`. Changing the site
default later leaves existing nodes as they are. A node keeps a language
that is disabled since; it is just not offered for new choices.

The nodes that existed before content languages are German: full-text search
had indexed them with the German configuration, and the content was German.
They were backfilled `de`, not with the app default.

### Search

Each node's search vector is built with its own language's text-search
configuration (`de` → `german`, `en` → `english`, a language without a
configuration of its own → `simple`). The generated `search_tsv` columns
can't read `nodes`, so pages and documents carry a mirror, `search_locale`,
written with every change of `nodes.locale` — the same arrangement as
`search_title` — and the CASE that picks the configuration lives in the
column's expression (the language → configuration map is
`features/search/contentRegconfig.ts`; a test keeps it in step with the
migration). Changing a node's language re-indexes that node only.

A query is parsed once per configuration a node can carry — every supported
language, so content in a disabled language stays findable — and the parses
are OR-ed into one tsquery, still a single index probe: a German query finds
English content where the words meet, and each language's inflections match
its own content. A `-term` exclusion holds within each language's branch, not
across them. A snippet is drawn with the row's own configuration. The search
overlay and the search page match through the same fragments
(`features/search/ftsSql.server.ts`, [search.md](search.md)).

Text extraction itself has no language-dependent step; the content language
decides how the extracted text is indexed.

### `lang` on content

The content element carries the node's language — the read view's and the
share view's `<article>`, the editor canvas, a document's title and field
values — so hyphenation, spell checking and screen readers follow the
content; the chrome around it keeps the interface's `lang`.

### Rendered in the content language

What is rendered into a page's content speaks the content's language, not
the reader's: query-block output — formatted dates and numbers, yes/no
words, `{{{class}}}`, the empty-state text — and every block's own words.
The renders run inside `withContentLocale(node.locale)`
(`platform/i18n/contentLocale.server.ts`), which swaps the language in
Paraglide's server context, so the render code reads it the usual way.

### Detected language, offered

When a document is uploaded (or its file replaced), its extracted text is
read for a language (`features/documents/detectLocale.ts`: the share of each
enabled language's function words; a short or mixed text decides nothing).
A language that differs from the document's is stored as a **suggestion**
(`documents.detected_locale`), and the document editor asks: "Detected:
German — use it as the content language?" The author takes it or dismisses
it; the content language never changes on its own. A suggestion goes once it
is answered or the language is set by hand. Pages and link documents are
never guessed. Documents uploaded before detection get suggestions from
`npm run db:backfill-search -- --suggest-locales`, an explicit one-off (a
default re-run would bring back dismissed suggestions).

## API channels

**GraphQL.** `PropertyDefinition`, `NodeClass` and `RelationshipType` offer
each localized field twice: `label(locale: Locale)` — one string by the
chain above, the request's interface language when the argument is omitted —
and `labels: [LocalizedString!]!`, every translation there is
(`description`/`descriptions`, `inverseLabel`/`inverseLabels` likewise). The
`Locale` enum lists the supported languages (`EN`, `DE`). A result node
carries `locale: Locale!` (its content language) and `className`, a
convenience string in the interface language; `LOCALE` is an intrinsic filter
field. The `search` query reads the text in every content language.

**MCP.** Catalogue entries (`list_property_definitions`, the `schema` tool's
catalogues) carry the resolved `label`/`description`/`inverseLabel` and the
full `labels`/`descriptions`/`inverseLabels` maps next to the unchanged
identifiers. Pages and documents report their `locale`; `locale` is an
intrinsic filter field for `traverse`. `get_page_html` renders in the page's
content language.

## Rules for what comes next

- **An enum (select) property type stores its option labels as
  `LocalizedText` from the start**, read through `localize()`; the stored
  property value is the option's key, never its label.
- The other admin-named registries — custom styles, namespace display
  names — still store one string. When one of them localizes, it uses this
  same primitive, as paragraph styles and page layouts do: the type, the
  resolver, the field and the gap indicator.
- **A new language** is a catalogue in `project.inlang`, and a dictionary in
  each plugin's `messages.ts` (the compiler refuses a plugin that lacks
  one), then enabled in Languages. Its text-search configuration goes into `CONTENT_REGCONFIG` and a
  migration recreating the `search_tsv` columns (otherwise it is indexed
  `simple`); its function words into the detector. Every existing label
  resolves through the fallback chain until it is translated.

## Content is not schema

A property's **value**, a page's text, a document's file are content, not
schema: they are never `LocalizedText`. A node is in one language;
translating content means a separate node per language linked to its
original — a different mechanism from the ones on this page.

## Related pages

- [design-system/overview.md](design-system/overview.md#writing) — interface strings, and the
  `LocalizedTextField` primitive.
- [settings.md](settings.md) — the Languages section and the profile's
  language.
- [semantic-layer.md](semantic-layer.md) — the schema entities whose labels
  these are.
- [dynamic-rendering.md](dynamic-rendering.md) — query conditions and
  templates, the `locale` field, and what query output renders in.
- [documents.md](documents.md) — search over documents.
