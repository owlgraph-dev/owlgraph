# The Nextcloud plugin

The plugin that ships with owlgraph: Nextcloud folders and files as
collections and documents, shown on a page by blocks of its own, read as
each viewer may read them. It is built on the plugin seam described in
[plugins.md](plugins.md), and is the example the
[Plugin Interface](plugins.md#the-plugin-interface) was shaped by.

> Decision: [0013. Nextcloud connections use Login Flow v2](../adr/0013-nextcloud-connections-use-login-flow-v2.md).

`src/lib/plugins/nextcloud/` shows a Nextcloud **public share** on a page and
turns its files into documents on request — and, to a person who connected
their account, their own files. It talks to one server — the address in its
settings, Nextcloud 29 or later, which "Check connection" confirms through
`status.php` — over the public WebDAV endpoint
(`/public.php/dav/files/<token>/…`), as the share's anonymous visitor: a
share's password, when it has one, is the Basic password of the user
`anonymous`; and over a person's own (`/remote.php/dav/files/<uid>/…`), as
them, with the app password their connection holds.

- A **collection** mirrors a share. It is made from the share's link (and
  password) beside the page whose block asked for it; the token is read from
  the link, checked against the server and kept only sealed. A collection is
  its whole share: whoever reads the collection may list any folder in it — a
  block's start folder is presentation, not a boundary. To show less, share
  less.
- A **document** mirrors one of the share's files. An editor makes it from a
  listing, once per file — matched by Nextcloud's file id, which survives a
  rename — and it holds its own sealed copy of the share's credential.
  Checking it again looks the file up anew; binding it to another file of the
  share keeps its node and its edges.
- **Listings** are read on request (PROPFIND, Depth 1), sorted and paged by the
  plugin, and kept in the app's process for the cache time of the settings,
  per server, credential (the share's token and password, hashed) and folder
  — revalidated by the folder's etag (Depth 0) before they are read in full
  again, and bounded by the entries they hold. A page's readers share one
  request.
- **Files** reach readers through grants: a listing row links
  `open?c&p&f`, a document its content route; the grant's route looks the file
  up and matches its id before it streams it.
- **When the share fails** — revoked, its password changed, the server down or
  redirecting, a folder of more than 2000 entries — a reader sees it
  unavailable and the collection's writers see why. A server that only fails
  may leave the last listing shown as stale; a share Nextcloud *refuses* —
  gone, or another password — is withdrawn from its readers, so every
  listing held of it is forgotten at once. A change of the share's state is
  kept on the node and logged once (`integration.source_state`); readers
  browsing a healthy share write nothing.
- **A refused share waits.** Every request comes from this one server, and
  Nextcloud slows an address down for each refused login it counts — so a
  share it refused is not asked again, for a listing or a file, until its
  wait is over: the cache time, doubling with each refusal in a row, a
  quarter of an hour at most (`server/cache.server.ts`). Anything that reads
  ends the wait — a writer connecting the collection anew is asked at once,
  and so is another credential for the same share. With a cache time of 0
  nothing waits, as nothing is kept.
- **A person's own account** is connected through Login Flow v2
  (`server/connect.server.ts`): `POST /index.php/login/v2` begins it, with the
  User-Agent `owlgraph (<this site's host>)` — the name of the app password it
  makes; the poll always goes to `/index.php/login/v2/poll` on the configured
  server, never to the address Nextcloud returned, and yields the login name
  and app password once; `GET /ocs/v1.php/cloud/user` tells the account's id
  (what its WebDAV paths name — the login name may differ) and display name;
  `DELETE /ocs/v2.php/core/apppassword`, authenticated by the app password
  itself, has Nextcloud forget it. A 401 is never retried: Nextcloud's
  brute-force protection counts them per address, and owlgraph is one.
- **Read as the viewer.** A collection knows its folder's Nextcloud file id —
  a share's root, learned when it is connected or from its root's listing —
  and a document its file's. A connected viewer reads a node from their own
  files (`server/resolve.server.ts`): `SEARCH /remote.php/dav/` for that id
  across what they own and what was shared with them, which keeps the id
  wherever it appears; failing that, at the path it had for whoever picked
  it, when they are the one asking and it still holds the id (a storage of
  their own the search does not cover). Every path a browser sees stays
  relative to the node's root, whichever way it is read. Else the node's
  share; else a placeholder — connect, connect again, or unavailable
  ([authorization.md](authorization.md#reading-another-service-as-the-viewer)).
  Where a root lies is kept per connection and file id
  (`server/locations.server.ts`) and confirmed by its id before an older
  location is used; a viewer's own listings are kept per connection and root,
  for the cache time but 30 s at most, apart from the shares'. What one viewer
  finds is never written to the node: only a share's listing keeps state on
  it.
- **From one's own files.** An editor browses their own Nextcloud through
  their connection (`GET own/listing?p=`, never cached) and makes from it a
  collection of a folder (`POST collections {pageId, own}`) or a document of
  a file beside the page (`POST documents {besidePageId, own}`) — nodes with
  no credential of their own, keeping the file id and, as a hint for the
  picker alone, the path it had for them: never shown, never indexed. Such a
  document is rebound only to another of the editor's files, a share's only
  within its share; checking one through someone's own files keeps what its
  file is, never whether they found it. While the plugin is turned off
  nothing of them is listed or made: `own/listing` lists nothing and says the
  plugin is off, and both POSTs refuse as the plugin being off — never as a
  connection missing.
- **Search** finds a collection by its share's name, a document by the
  folders its file sits in, the file's
  name and that name without its extension ("Bericht" for Bericht.pdf, which
  full-text search reads as one word), and both by "Nextcloud"
  (`server/search.ts`); a node picked from someone's own files by its name
  alone. Only the files made documents are found: a listing's other files are
  read live and never indexed.
- **A collection's own page** shows its folder's live listing below the
  core's header, from the folder's root — the folder block's component, as a
  page's reader meets it (`views/CollectionBody.svelte`), started from the
  listing the plugin holds for the viewer's way of reading it
  (`server/nodeView.server.ts`). Its footer says how this viewer reads it:
  "read as" their account's name in Nextcloud, or "via share". The header's
  source chip says how the collection can be read at all — through its share,
  through the files of whoever connects (its folder's id known), or both — and
  a viewer with an active connection is offered the folder in Nextcloud
  (`<server>/index.php/f/<file id>`, which Nextcloud routes with or without
  pretty addresses); no page ever carries a share's address. A writer makes a
  document of a file there as in the editor — of a share's collection: a
  folder of someone's own files has no share for a document to hold, so
  neither its page nor its block offers one, and the file block's browser
  lists only the collections of a share.

## The folder block

`nextcloudFolder` lists a collection — a share's folder, or a folder of
someone's own Nextcloud, read the way each viewer may read it — starting at a
folder in it, on a page: one component (`FolderListing.svelte`) for the
editor, the server render and the island
([blocks/anatomy.md](blocks/anatomy.md#svelte-leaf-blocks)). It is a
card (the `cards` group's defaults), with spacing, surface, typography and
placement; how its listing reads — density, the sort it opens with, its size
and date columns, whether a reader may open subfolders, how many entries a
page holds (at most 200), whether the files that are documents are marked —
are attrs of the block, the same at every viewport. It is the collection
family's kind for the plugin's collections
([blocks/node-embeds.md](blocks/node-embeds.md#one-family-in-the-editor)): the Insert menu lists it
under "Collection", and a collection block given a Nextcloud collection in
its picker becomes one.

- **Authored elements and controls.** Its box, header, breadcrumb, column header, rows,
  "Document" chip and footer ("4 of 37 · Nextcloud, 40 s ago") are authored
  elements, styled by the capability cascade: it draws them with the content
  feature's listing (`EntryList`,
  [blocks/anatomy.md](blocks/anatomy.md#shared-listings)) and keeps what it lists and
  how — the fetch, the breadcrumb within the share, the sort, where a row
  leads. Its sort,
  refresh, back and "load more" are design-system controls, drawn in the
  scheme of the region they sit in. The editor's own action, "Create
  as document" on a file's row, comes in with the editor's side of the block,
  so the page never has it.
- **What a page renders.** Before the page renders, the block's data is the
  listing the plugin holds for its folder — its first 50 rows — or `loading`,
  with a fetch for next time started; the page never waits on Nextcloud. For
  a viewer who reads it from their own files, that is the listing held for
  their connection, else the share's meanwhile, else `loading`. Once on the
  page, the island revalidates and keeps the listing current — from the
  viewer's own files where they hold it; a reader's open folder and sort are
  their own, never stored. The rows render the same on the server and in the
  browser — numbers and dates in the page's content language, in UTC.
- **What a reader opens.** A file's row links its stable address
  (`open?c&p&f`): a PDF, plain text, Markdown or an image opens in a new tab,
  anything else downloads. A folder's row opens it in place, inside the
  block's start folder.
- **Placeholders.** Without a listing, a reader sees one neutral line —
  whether the share fails or the collection is not theirs to read — and the
  editor sees why, what was last known of the share, and the way to its
  collection's page, where the share is connected anew. A folder read from
  each viewer's own files asks a signed-in reader without a connection to
  connect their account, and one whose connection Nextcloud refused to
  connect again — a link to their connections page that brings them back to
  this page (a full navigation) — and asks nothing more of the server until
  they did; anyone else sees the neutral line.
- **On a phone's canvas** the header folds to back and the folder's name, the
  sort to an icon that opens a sheet (apply or cancel), and a row is two lines
  — its name, then its size and date — at least 48px tall, ending in a chevron
  for a folder or a download for a file.

The block settings panel's **Source** section picks the collection — one of the
plugin's, a new share connected beside the page, or a folder chosen from the
editor's own Nextcloud ("Choose from my Nextcloud …", made a collection beside
the page) — its start folder, and shows how the collection answers the editor;
**Display** holds the listing's attrs. Folders and files are browsed live in
one dialog (`TreeBrowser.svelte`), through a collection or through the
editor's connection. While the plugin is turned off a block's picker names
each collection (and each document) by its node alone, nothing of its share,
folder or file, and its answer says the plugin is off; the dialog then says
so at once, and nothing can be chosen in it. The Insert menu offers the block
in its Collection group, after the curated collection.

## The file block

`nextcloudFile` shows one document of a Nextcloud file on a page — a share's,
or one of someone's own files — the document by id; what the file is comes
from the document's node and its record, never from the block. One component
(`FileCard.svelte`) draws it in the editor and on the server; nothing of it
hydrates. It draws through the content feature's document entry
(`DocumentEntry`, [blocks/anatomy.md](blocks/anatomy.md#shared-listings)) and keeps
what is its own: which state the document is in and what each says, where it
is in its share, and the editor's repairs. It is a card (the
`cards` group's defaults), with spacing, surface, typography and placement;
how it reads — a row or a card, titled by its node or its file (a row by its
file, a card by its node, unless the block says which), a preview or none,
its details, its download and the way to its node — are attrs of the block,
the same at every viewport. It is the document family's kind for the
plugin's documents ([blocks/node-embeds.md](blocks/node-embeds.md#one-family-in-the-editor)): the
Insert menu lists it under "Document", and a document block given a Nextcloud
document in its picker becomes one.

- **One link.** On the page the file — its glyph or preview, its title and
  its details ("PDF · 1.2 MB · Oct 2, 2026", and the share and folder it is
  in) — is one link to the document's content route, which answers each
  reader with a grant of their own: a PDF, plain text, Markdown or an image
  opens in a new tab, anything else downloads. "Download" is a design-system
  control linking the same route as an attachment; on a phone's canvas, in a
  row, it is its icon alone, and the row is at least 48px tall.
- **Previews.** A card shows an image — PNG, JPEG, GIF or WebP, up to 10 MB —
  as its own preview, loaded lazily through the document's content route like
  any reader's request; any other file is its type, drawn as a tile. No PDF
  is framed: every response but a diagram's frame forbids being framed.
- **What a page renders** is the document as the plugin last recorded it,
  resolved before the render without asking Nextcloud: its node, its file,
  where it is, how its share last answered. The record is kept current where
  the file is used — a reader opening it records a file that is gone, an
  editor opening the page checks it.
- **Placeholders.** A document the viewer may not read is one neutral line
  and nothing of it, and so is every file block while the plugin is turned
  off; a file its share no longer serves is its name and the same line. The editor sees why ("File not found in Nextcloud", "Share
  revoked"), what was last known — its file id, when it was last seen, that
  the node stays — and two repairs: **Check again**, and **Choose another
  file** of the same share, which binds the same node to it, its edges kept.
  While the plugin is turned off the editor sees that ("Integration turned
  off"), the document's node and that it stays, and **Check again** alone:
  the plugin's document routes answer a document as its node and nothing of
  its file, look nothing up and keep nothing, and make or bind no document.
  A document of someone's own files renders as recorded to a viewer with an
  active connection — its content route reads it from their own files, or
  not at all — asks a signed-in reader without one to connect (or to connect
  again), and back to the page, and is the neutral line to anyone else.

The editor follows each document in one place (`documents.ts`), shared by
every block showing it and by the block settings panel, so a check or another file chosen
in one shows in all; the editor checks a document's file as it opens the page,
or reads its record where it may not write the document. The block settings panel's
**Source** section picks the document — one of the plugin's documents, one
made of a file chosen in a share's folders, or one made beside the page of a
file chosen from the editor's own Nextcloud (one per file in the page's
namespace) — and shows its file, its status, the way to its node and "Another
file" (of its share, or of the editor's own files); while the plugin is
turned off it offers no file to choose, from a share's folders or from the
editor's own files, and says the integration is off. **Display** holds the
block's attrs.
The Insert menu offers the block in its Document group, after the file or
link.
