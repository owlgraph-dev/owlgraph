# Documents

A **document** is a node ([architecture/overview.md](overview.md#the-node-model))
whose content is not a block tree: it is an uploaded file, or an external
address. Either way it is a full node: it has a title, a class (at least the
`document` type class, which carries the `documents:` metadata fields), tags,
properties, relationships, visibility and share links. It appears in search,
in the graph and over MCP, and pages cite it with a `quickLink` block or an
inline `[[doc:…]]` link, or embed it with a document block — its file, or a
link's host, as each reader may read it
([blocks/node-embeds.md](blocks/node-embeds.md#collection-and-document-blocks)).

The documents feature (`src/lib/features/documents`) owns the `documents`
table, the upload and link paths, the serving routes, text extraction and the
reader view (`DocumentView`). The document editor shell lives in the editor
feature (`DocumentEditor`, `DocumentSourcePanel`).

## Sources

Where a document's content comes from is its **source**, the
`documents.source` column:

| Source | Content | Columns set |
|---|---|---|
| `upload` | a stored file (PDF, `.txt`, `.md`, up to 25 MB) | `bytes`, `mime`, `size`, `sha256`, `filename`, `search_text` |
| `link` | an external address (a DOI, a file in Nextcloud, a download page) | `external_url` |
| `plugin` | a file another service keeps, reached through an integration ([plugins.md](plugins.md)) | `plugin`, `source_ref`; `filename`, `mime`, `size` as the service last reported them |

`source` is a discriminator, not a flag: a further kind (an authored
document) extends the same column. The check `documents_source_shape_check`
keeps each row honest without naming every kind: an upload has all of its
file columns, and `external_url` is set exactly when the source is `link`. A
new kind replaces `documents_source_check` in its own migration.

A **plugin's** document names its integration in `plugin` (the plugin's
id: data, so the schema names no integration) and carries the integration's
record of the file in `source_ref` — a path, an id, what it last saw, never a
credential, which is stored sealed apart
([authorization.md](authorization.md#secrets)). It has no bytes here; its
`filename`, `mime` and `size` are what the service last reported, so every
view shows it like a file. It keeps its source: neither the editor nor the
content endpoint switches it to an upload or a link (`409`), and it is made
by its integration, never by the create form or an agent. Its content is the
integration's to serve, never a copy stored here ([The content
endpoint](#the-content-endpoint)).

A link exists for referencing work without redistributing it: a paper is
cited by its DOI, not re-hosted.

### The external address

> Decision: [0009. The server never fetches an external document's address](../adr/0009-the-server-never-fetches-an-external-address.md).

A link document's address is validated by `parseExternalUrl`
(`externalUrl.ts`, shared by the create modal, the editor, the API and MCP):

- only `http:` and `https:` are accepted (no `javascript:`, `data:`,
  `file:`, `mailto:`), and no credentials in the URL;
- at most 2048 characters (also a database check);
- a DOI is the one shorthand: `doi:10.1000/x` or a bare `10.1000/x` is stored
  as `https://doi.org/10.1000/x`. Nothing else is rewritten.

**The server never fetches the address.** There are no previews, favicons,
title lookups or health checks: fetching would be a server-side request to an
author-chosen host (SSRF) and would tell that host who reads what. The host
alone (`externalHost`) is shown beside the link as context.

The address is content. It is never logged (see
[logging.md](logging.md#data-rules)), and where it becomes an `href` it is
re-checked at render (`safeExternalHref`), so a row written past the API
(a restore, a hand edit) can never render as a script URL.

### Reading a document

The reader view (`/[[namespace]]/[slug]`, and a share link's `/share/[token]`)
shows the metadata in both cases. Then:

- an **upload** shows its file (name, type, size) with *View*, which opens
  the bytes in a new tab, and *Download*;
- a **link** shows *External document* with the host and one action,
  *Open*: the document's content address in a new tab with
  `rel="noopener noreferrer"` (no opener, no referrer), marked with the
  external-link icon. The address itself is never in the page; the host
  beside the button names where it leads. There is no viewer and no download.

All of these actions point at the document's content address
(`documentContentPath`), whatever the source.

### The content endpoint

A document's content has one address, whatever its source:
`/api/documents/[id]/content`, and `/share/[token]/content` through a share
link. A page has content too; a document's is a file or an external address.

| | Upload | Link | Plugin |
|---|---|---|---|
| `GET` | the stored bytes (`?download` for an attachment) | `302` to the external address | what its integration answers: a `302` to a grant for this reader |
| `PUT` | `multipart/form-data` with `file`: store a file | `application/json` `{ externalUrl }`: set the address | `409` — its file is changed where it is kept |

**Reading.** `GET /api/documents/[id]/content` is gated by the document's
visibility, `/share/[token]/content` by the share link. A reader who may not
see the document gets a 404 either way, never a redirect, so a hidden link
document's address doesn't leak through its content URL. An upload's bytes go
through `documentBytesResponse` (`serve.server.ts`) under the served-file rules
(`platform/servedFile.ts`, shared with what an integration passes on): inline
only for the inert types, text under a sandbox CSP, `nosniff` always,
cacheable only when the document is public and reached without a share link.

A plugin's content is its integration's to serve, after the same check
([plugins.md](plugins.md#sources)): it answers with a redirect to a grant —
a sealed address for this reader, valid for five minutes, which re-checks the
reader (or the share link) when it is followed ([plugins.md](plugins.md#grants)).
The page links the stable content address, never a grant, so its HTML is the
same for every reader — the integration's own block for one of its documents
(the Nextcloud file block, [plugins.md](nextcloud.md#the-file-block)) links it
for the file and, with `?download`, for its download. An integration that is
gone, or serves nothing, is a 404.

A link's content is a redirect (`externalContentResponse`). It is not an open
redirect: the target is the stored document's, never taken from the request,
and only a reader of the document gets it. It is re-checked before it becomes
a `Location` (an address that fails answers 404), is never cached (the
address can change), and carries `Referrer-Policy: no-referrer`, so the
destination never learns which document or page linked it. The server still
never fetches the address; the browser follows the redirect.

**Writing.** `PUT` sets the content and switches the source when it differs
(below). It needs write access to the document; any other body type is a
415. A file goes through the same checks as a new upload (type, size, the
magic bytes), and an address through `parseExternalUrl`.

### Choosing and switching the source

The create modal (*Create → Document*) asks for the source: *Upload a
file* (a file, the title defaulting to its name) or *Link* (an address
and a title, which is required since there is no filename to fall back on).

In the editor, the *Source* panel shows the current source. Within a source,
replacing the file or editing the address (both a `PUT` of the content)
applies at once. Switching to the other source is one confirmed action:

- **upload → link** deletes the stored file. Its bytes, type, size, hash and
  extracted text are cleared in the same update that sets the address, so no
  file outlives the switch (the bytes live in the row itself, so there is
  nothing else to collect).
- **link → upload** stores the new file and clears the address, in the same
  update.

Every switch is audited as `document.source_changed` (from, to; never the
address).

## Search

`documents.search_tsv` is generated from three app-maintained columns:
`search_title` (weight A), `search_meta` (B: the document's property values
and tags, and for a plugin's document what its source says of it) and
`search_text` (C: the text extracted from an upload), each indexed with the
text-search configuration of the document's content language
(`search_locale`, the mirror of `nodes.locale` — [languages.md](languages.md#search)).
A link document has no file text, so it is found by its title and its
metadata. A plugin's document has none either; its integration's words
(`source_search` — the folders its file sits in, the file's name, the
integration's name; [plugins.md](plugins.md#sources)) are written by the
integrations host with every write of its record, so it is found by the file
it shows now, whatever its title says. `search_meta` is rebuilt
(`refreshDocumentSearchMeta`) whenever the document's properties, tags or
source words are written, and by `npm run db:backfill-search`, which asks
each integration for its words first.

When an upload's text reads as a language other than the document's, the
document editor offers it ("Detected: German — use it?"); the content
language changes only when the author takes it
([languages.md](languages.md#detected-language-offered)). A link document is never
guessed.

In search results a link document is a document like any other: the source is
a detail of the document, not a kind of result. A result opens the document's
own page, which is the citation point.

## Queries

A link document's address is a query field, `externalUrl` (see
[dynamic-rendering.md](dynamic-rendering.md)): a `ContentNode` field, a
mapping key for templates (`{{{externalUrl}}}`), and an intrinsic filter
field (`EXTERNAL_URL`) whose `EXISTS` / `NOT_EXISTS` select the link
documents. It is distinct from `url`, which is always the node's own page. A
literature list is a traversal from the page along a relationship type to the
documents it cites, mapping `externalUrl` into a link.

## `sourceKind` and `documents:source`

The API and MCP call the discriminator `sourceKind`. `source` is
already the bibliographic field `documents:source` (publisher, journal), a
property in the `documents:` group, which says *who published* a work, not
where its file lives. The property's description says so, and the editor shows
a class field's description as its hint.

## MCP

`list_documents` and `get_document` report `sourceKind`, and `get_document`
also reports `externalUrl`. `get_document_text` answers a link document with
a note that it has no stored text. `create_document_link` (`page:write`) lets
an agent add a link document, for example for literature it cites. Uploading,
visibility, sharing and deletion stay with people.

## Related pages

- [architecture/overview.md](overview.md) — the node model.
- [authorization.md](authorization.md) — document visibility and writes.
- [dynamic-rendering.md](dynamic-rendering.md) — queries, mapping, templates.
- [semantic-layer.md](semantic-layer.md) — classes and the `documents:` group.
- [logging.md](logging.md) — `node.created` and `document.source_changed`.
- [backup.md](../guides/backup.md) — what a backup carries.
