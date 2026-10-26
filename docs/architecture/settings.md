# Settings

`/settings` ("Settings") is where everything a signed-in user may
manage lives: their own profile and API tokens, and — for whoever holds the
permission — the site's content settings, appearance, structure, the
semantic schema and user accounts. It is one place for every role, not an
"admin area": what a viewer sees there is derived from their permissions,
and each section's route is enforced by the same permission server-side.

## Permission-scoped, per section

Every settings section maps to exactly one `<resource>:manage` action of
the role check ([authorization.md](authorization.md)); About, the one leaf
that leads out of the settings, is gated by a view action
([The general group](#the-general-group)):

| Group | Section | Route | Action |
|---|---|---|---|
| Personal | Profile | `/settings/profile` | — (every signed-in user) |
| Personal | API tokens | `/settings/api-tokens` | — (every signed-in user) |
| Personal | Connections (while a plugin offers connections) | `/settings/connections` | — (every signed-in user) |
| General | Languages (the enabled languages, the site default language) | `/settings/languages` | `locale:manage` |
| General | About (a link to the page about this software, outside the settings) | `/-/about` | `installation:view` |
| Content | Navigation | `/settings/navigation` | `navigation:manage` |
| Content | Home page | `/settings/home` | `homepage:manage` |
| Content | Footer (columns, legal line, footer branding) | `/settings/footer` | `footer:manage` |
| Appearance | Branding (logo, logo for dark, interface font, colours incl. the app bar's and footer's backgrounds, typography, capability defaults — "Block defaults") | `/settings/branding` | `branding:manage` |
| Appearance | Colour scheme | `/settings/color-scheme` | `branding:manage` |
| Appearance | Fonts | `/settings/fonts` | `font:manage` |
| Appearance | Custom styles (named styles, free CSS) | `/settings/styles` | `stylesheet:manage` |
| Appearance | Page layouts (the page layouts authors choose) | `/settings/page-layouts` | `page-layout:manage` |
| Structure | Namespaces | `/settings/namespaces` | `namespace:manage` |
| Semantic schema | Properties | `/settings/schema/properties` | `property:manage` |
| Semantic schema | Property groups | `/settings/schema/groups` | `property-group:manage` |
| Semantic schema | Relationship types | `/settings/schema/relationships` | `relationship:manage` |
| Semantic schema | Classes | `/settings/schema/classes` | `class:manage` |
| Access | Users | `/settings/users` | `user:manage` |
| Integrations | one section per plugin that declares settings, under its own name | `/settings/integrations/<id>` | `integration:manage` |

There is no "may enter settings" permission and no is-admin check anywhere
on the surface. A role is a bundle of these actions (`ROLE_ACTIONS`,
`src/lib/features/auth/authz.server.ts`): admin holds all of them, editor
and viewer none — so an editor's settings are the personal group alone. A
future knowledge-manager role is a new bundle (the four schema actions,
say) and nothing else changes: not the tree, not a route, not a guard.

### Hidden is not protected

Two mechanisms share the table above, and both are needed:

- **Visibility** — the tree (`src/lib/shell/settings/tree.ts`, the single
  source of truth for groups, sections, routes, labels, descriptions and
  search keywords) is filtered by the viewer's granted actions
  (`visibleTree`, `treeModel.ts`). The `/settings` layout load
  (`src/lib/shell/settings/layout.server.ts`) answers only "which of the
  tree's actions does this viewer hold"; it gates nothing and touches no
  database, since it reruns on every form-action update inside the surface.
  Groups with no visible section are dropped; the overview page renders
  the same filtered tree.
- **Enforcement** — every section's route adapter calls
  `requireAction(user, action)` (`src/lib/features/auth/routes/requireAction.server.ts`)
  with that section's action in its `load` **and in every form action**.
  Form actions resolve from the nearest `+page.server.ts` and run before any
  layout load, so a layout-level guard would never protect a direct POST —
  which is why the layout deliberately has none. A user without the action
  gets 403 on GET and on POST, whether or not the sidebar ever showed the
  section. The personal sections have no guard beyond the sign-in gate;
  their adapters are scoped to `locals.user` by construction.

The search only ever runs over the filtered tree, so a hidden section can't
be discovered by name either.

### The personal group

Profile holds what belongs to the signed-in person rather than to the site:
display name, avatar, the **interface language** and the **appearance**
(the colour scheme: System, Light, Dark —
[theming.md](theming.md#the-viewers-preference)). The appearance is a device
preference kept in a cookie and applies at once. The language is the
account's: choosing one stores it on the user (and in the explicit-choice
cookie) and reloads, and it then follows the user to every device — it
comes first when the interface language is resolved: account →
explicit-choice cookie → `Accept-Language` among the enabled languages →
the site default ([languages.md](languages.md#the-interface-language)). The same
picker (`src/lib/shell/LocaleSwitcher.svelte`) also sits in the app bar's
account menu for anonymous visitors, who cannot reach settings but still
choose a language; for them it is the cookie alone. It offers the enabled
languages. API tokens is another personal section
([authorization.md](authorization.md)).

Connections lists the person's own accounts at the services a plugin shows
content from ([plugins.md](plugins.md#connections)) — one row per plugin that
offers connections, present in the tree while one does. A row says whether
the service is set up here, who the person is there once connected and since
when, and offers what fits: connect (the service's approval page opens in a
window of its own, and the row waits for the approval, also across a
reload), connect again (after the service refused the connection, or once the
service's address changed), check again, disconnect. A page that asks the
viewer to connect links here with `?return=`, and the page offers a way back
to it — only when it is a path on this app (`safePath`, the check sign-in's
`?redirect=` uses); for anything else it offers none. The section never shows
a credential.

### The general group

General holds what applies to the whole site rather than to one area.
Languages chooses which of the app's languages are **enabled** — what the
interface offers and negotiates, what content may be written in — and the
**site default language**: for visitors whose browser asks for no enabled
language, as the content language of new pages and documents, and as the
language every schema label must have. The default is always enabled;
disabling a language keeps everything already written in it
([languages.md](languages.md#the-sites-languages)).

About is not a section but a way out: it opens the page about this software,
`/-/about` (which owlgraph runs, its licence, the source code of this
version — [deployment.md](../guides/deployment.md#source-code-for-network-users)). That page is
public, reached by everyone from the footer's info icon; the leaf is gated by
`installation:view`, held by admins only, because how the installation runs
is what the page adds for them.

For `installation:view`, the page continues with how the installation runs,
in the settings' row pattern (`src/lib/shell/about/installation.server.ts`):

- **Installation:** the version and revision, the address the site is served
  from, Node.js and PostgreSQL, the enabled languages and the default.
- **Integrations:** each plugin, whether it is on, its service's host, and
  how many of the connections people made to it are active.
- **Diagnostics:** what can be wrong with an installation. The database
  schema shows the migrations applied against those the version ships, and
  names any still waiting. The secret key shows whether `APP_SECRET_KEY` is
  set and usable, never a character of it.

It shows only what the server knows as the page is asked for. What nothing
records (the last backup, a key's rotation, CSP reports, whether the MCP
server is up) is not shown, and nothing stands in for it. The decision is
made in the page's load, for the current viewer: for anyone else nothing of
it is gathered, so none of it reaches their page or its data.

A leaf whose `href` leads out of
`/settings` (`leavesSettings`, `treeModel.ts`) is a full navigation from the
sidebar, the overview and the search alike: the settings run under the
looser style-src, and the page it opens must get its own
([architecture/overview.md](overview.md#content-security-policy)).

### The footer

Footer (in Content) edits the link columns, the legal line (a text and a flat
list of links: imprint, privacy, contact) and the footer's branding. The
legal line always ends with one more item that is not footer data: an info
icon linking to `/-/about`, the offer of the licence and the source code
(AGPL-3.0 §13, [deployment.md](../guides/deployment.md#source-code-for-network-users)). The
section shows it as its last row, "Software notice — Always visible",
with nothing to edit or remove, since no setting stores it. A site with no
footer configured still renders the footer, as a single line holding the
icon on the page's own surface (`site/components/Footer.svelte`).

### The integrations group

Integrations holds one section per plugin that talks to another service
([plugins.md](plugins.md#settings)): the tree builds it from the plugin
registry, so the group is absent while no plugin declares settings. A section
is drawn by the core from the fields the plugin declares — the switch that
turns it on, the service's address, a number or two — as one form with one
Save, and "Check connection" probes the service at the address as typed,
before anything is saved. Turning an integration on needs the address and the
deployment's `APP_SECRET_KEY` ([authorization.md](authorization.md#secrets));
the section says which is missing beside the control it concerns. For an
integration people connect their own accounts to
([plugins.md](plugins.md#connections)) a row below the form says how many
connections are active and offers **Disconnect everyone** behind a danger
confirm: the connections go at once, and the service is asked, in the
background, to forget each access. Saving a new address ends every connection
made for the old one — a connection is never sent to another address — and
says how many it ended; turning the integration off keeps them.

The account menu itself (`src/lib/shell/appbar/AccountMenu.svelte`) is the
signed-in entry point to this surface: an identity header (avatar, name,
email, the role as a quiet sentence-case badge) followed by uniform items —
Profile (`/settings/profile`), Connections (`/settings/connections`, while a
plugin a person may connect to is turned on), Settings (`/settings`),
Sign out. The
role badge is context, not a gate: `/settings` is one link for every role
because the surface scopes itself.

## Layout

The surface brings its own frame inside the app bar
(`src/lib/shell/settings/SettingsShell.svelte`): a sticky left sidebar —
the title, the settings search, then the navigation tree (`SettingsNav.svelte`:
the fixed Overview link, then each group as a small muted label over its
sections, the current section marked `aria-current`) — beside a wide
content pane. The root layout opts `/settings/*` out of the reading column
and renders no footer there (the footer is for public content). The sidebar
is sticky against the document, the app's one scroller, just below the app
bar ([responsive.md](responsive.md#what-scrolls)). Nothing between the two
may have an `overflow` of its own.

At and below 768px the sidebar is hidden and a compact bar at the top of the
pane (the current section's name and a "Sections" button) opens the same
navigation in a `BottomSheet` — the house phone pattern
([design-system/overview.md](design-system/overview.md), "Sheet"). Sidebar and bar are both
always in the DOM and toggled by CSS, so server and hydrated markup agree;
the sheet mounts only while open, so there is never a second navigation
landmark.

## The settings-row content pattern

A settings page is one long, scannable form, not a grid of cards. Its
building blocks are design-system primitives:

- **`SettingsGroup`** — a titled group of rows with one optional intro
  line; sections are separated by space and a rule.
- **`SettingsRow`** — one setting: label and one-line description on the
  left (`minmax(200px, 240px)`), the control on the right. `for` ties the
  label to a single control's id; without it the row is a labelled group.
  `layout="wide"` stacks the control full-width beneath the text, for a
  tree editor, a token list or a table. Rows stack label-over-control when
  the row itself is narrow (each row is its own `inline-size` container,
  stacking below 560px), not on the viewport — a narrow pane beside the
  sidebar reads like a phone, and a row placed outside the settings shell
  behaves the same without its host declaring anything.
- **`SettingsWell`** — the one inset surface, for a preview of an asset
  (the logo, an avatar, a freshly created token) with its actions beside
  it. Everything else is rows.

A page's head (`src/lib/shell/SettingsPageHead.svelte`) carries the
section's title as the page's `h1`, one intro line, the single Add action
and the action-result error banner. Auto-submitting pickers are the
design-system `Select` writing to a hidden input and calling
`requestSubmit()` on the row's own form.

Branding (`src/routes/settings/branding/+page.svelte`) is the reference
instance: the logo in a well, the interface font as a row, the token list
and the paragraph-styles table as wide rows — the table carrying the list
page's row controls (an auto-submitting `Select`, a `Switch` posting its own
row form, icon actions) and its add/edit modal — and the Block defaults
matrix (`BlockDefaults.svelte`): one row per capability, one column per
block-type group, the block settings panel's own segmented steps and theme-colour
pickers, edited as one draft and saved with one action like the colours
([blocks/capabilities.md](blocks/capabilities.md#capability-defaults)). List sections (users,
namespaces, the four schema catalogues, API tokens) stay on the list
pattern — head, `Table`, add/edit in a modal — described in
[design-system/overview.md](design-system/overview.md), "Settings pages".

## Routes and reserved words

Routes mirror the tree, nested where the tree nests (`/settings/schema/*`).
The route files are one-line bindings to feature adapters, as everywhere
(`src/routes/settings/<section>/+page.server.ts` →
`$lib/features/<f>/routes/<adapter>.server`). `settings` is a reserved
slug ([routing.md](routing.md)); the retired `/admin`, `/properties` and
`/account` prefixes are released and have no redirects.

## Related pages

- [authorization.md](authorization.md) — the role check, `can()` and `requireAction`.
- [design-system/overview.md](design-system/overview.md) — the primitives and the settings-page patterns.
- [semantic-layer.md](semantic-layer.md) — what the schema group manages.
- [custom-styles.md](custom-styles.md) — what the Custom styles section manages.
