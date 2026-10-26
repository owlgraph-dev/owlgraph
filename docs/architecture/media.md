# Media

Images uploaded to the app — an image block's, a background image's, the
site logo, a user's avatar — and how they reach a reader's device: what is
stored, what is served to whom, and the narrower copies a device gets instead
of the whole upload. Fonts share the storage and nothing else.

## What is stored

Every asset is a row of `assets`: its bytes (`bytea` — the whole app lives in
Postgres, [backup.md](../guides/backup.md)), its type, its owner (a page, a user, or the
site) and, for a raster image, its **size in pixels** (`width`, `height`,
upright). The module that stores them is `features/media/media.server.ts`;
the one that reads and writes image formats is `features/media/images.server.ts`
(sharp, which bundles libvips).

An upload is a PNG, JPEG, WebP or GIF of at most 8 MB whose bytes carry the
signature of the type it was declared as, and which decodes as an image —
bytes that only look like one are refused (415). Before it is stored:

- **A photo's metadata is removed.** A phone photo carries the camera, the
  time and the GPS position it was taken at; published, it would tell anyone
  where. An image that carries EXIF, XMP or IPTC data, or an orientation flag,
  is turned upright and saved again — JPEG at quality 90, WebP at 90, PNG
  losslessly — keeping its colour profile. An image without any is stored
  byte for byte.
- **It is measured**, upright.
- **An animation is left whole**: a GIF or an animated WebP is measured, never
  re-encoded (a re-encode would keep only its first frame).

The bytes behind an asset id never change after that — replacing an image
uploads a new asset, and the next save drops the old one
([blocks/capabilities.md](blocks/capabilities.md#asset-references)).

## Who is served what

`GET /api/media/<id>` serves a page's image to whoever may read the page
(404 otherwise, so its existence isn't revealed); a public page's images may
be cached for an hour, every other image is `private, no-store`. Not longer:
were a page made private later, a copy held for a year would outlive the
decision. Instead every image carries an **ETag** — its stored hash, and the
copy's width for a copy — so a browser whose hour is up asks with
`If-None-Match` and is told "not modified" (304), without the bytes being
read or sent: a revisit costs a round trip, not the image. A share link
grants its page, not its assets: on a share link to a page that isn't public,
images don't load ([blocks/capabilities.md](blocks/capabilities.md#asset-references)). The logo and the
avatars have routes of their own.

## Copies for smaller screens

A phone shows a 1600 px photo in a 358 px column, and a 2400 px hero across
390 px: the whole image travels to be scaled down. So an image is also
served as **WebP copies** at the widths of one fixed ladder,
`MEDIA_WIDTHS` (`features/media/mediaUrl.ts`): 320, 640, 960, 1280, 1920 and
2560 px. A phone's column at 2–3×, a tablet's and the reading column at 2×
each fall on a step.

- `GET /api/media/<id>?w=<width>` is the copy at that width — under the
  image's own gate and cache rule. A width off the ladder is refused (400), so
  a page can't make the server store any number of sizes; a width as wide as
  the image or wider is the image itself, and so is any width of an
  animation.
- A copy is made **the first time it is asked for** and kept in
  `asset_variants` for the next request: uploads stay fast, images uploaded
  before copies existed need no conversion run, and only widths a device
  actually asked for are stored. At most two copies are made at once (a large
  photo decodes into tens of MB); a second request for a copy being made waits
  for it. A copy that can't be made is logged (`media.variant_failed`) and the
  image itself is served — never a broken image.
- Copies are derived data: deleted with their image, left out of backups, and
  made again on demand after a restore.

### How a block offers them

An image block lets the browser choose (`blocks/image/imageSources.ts`, one
function for the editor's NodeView and the page's renderer, so both ask for
the same files):

- `srcset` lists the ladder's copies narrower than the image and the image
  itself as the widest;
- `sizes` says how wide the image is shown on each viewport — its width % of
  the column, or its own width, never wider than the column — and leads with
  `auto` for an image that loads lazily, so a browser that can measures the
  laid-out width instead;
- a width of Auto keeps the image at its own width (`--img-w`): a copy picked
  from a srcset would otherwise be laid out at the width `sizes` named. Not
  in a fitted box of a set height, whose width is the one that height gives
  the picture;
- its height follows its **aspect ratio, from its stored size**
  (`aspect-ratio: auto <width> / <height>`), whichever copy is picked — the
  one source of the box's shape in the editor and on the page. A fitted box's own ratio
  replaces it.

It carries no `width`/`height` attributes. An image that hasn't loaded is
laid out at their size before its column caps it: on a phone's first layout
one 900 px image made the page 908 px wide, which a phone's browser zooms out
to fit. The ratio stands in for them where the browser has none of the
picture's own:

- an image whose `sizes` leads with `auto` is laid out with its size
  contained — the HTML standard's own stylesheet gives it `contain: size`, as
  if it had no picture, 300 × 150 px. Without a ratio it is 150 px tall in
  whatever width its column gives it, the picture stretched into that;
- an image that hasn't loaded yet is already as tall as it will be, so
  nothing shifts as images arrive.

`auto` first lets a loaded image's own ratio count wherever the browser has
one.

### Backgrounds

A background image (a section's, a container's, a cell's) asks for copies by
the screen's density instead, one pair per canvas tier — the width the tier's
canvas gets at 1× and 2× (`TIER_COPY_WIDTHS`, `capabilities/surface/surfaceImage.ts`):

| Tier | 1× | 2× |
|---|---|---|
| desktop | 1920 | 2560 |
| tablet | 960 | 1920 |
| phone | 640 | 1280 |

as `image-set(url(…?w=640) 1x, url(…?w=1280) 2x)` in that tier's value, so
every tier that shows an image names its own copies. A covering or contained
image is scaled to its box anyway; a tiled one is the image itself, whose own
pixels set the size it tiles at (a density would shrink the tiles).

### The renderer and the editor

The renderer needs the sizes of the images it draws: the page and share-link
routes look them up for the asset ids a doc holds (`getAssetSizes` over
`collectAssetIds`) and hand them to `renderDoc`; the editor gets them with its
load and keeps an upload's size from the upload's response
(`content/blocks/image/assetSizeRegistry.ts`). The editor draws every image as the page
draws one past its opening — lazily, its `sizes` leading with `auto` — so the
browser lays both out by the same rules, and a page's image can't be drawn
differently from the one being edited. It draws each block once through the
image node's `renderHTML` before it swaps the NodeView in; that drawing
carries the same srcset, because an `<img>` starts loading the moment it has
a `src` — without it the editor would fetch the whole image beside the copy.
For the same reason the image's component (`blocks/image/PageImage.svelte`)
writes how to load (`loading`) and its copies before its `src`. An image whose size isn't known renders by
its `src` alone, as images did before.

## The image a page opens with

The image at the top of a page — a hero, a header picture — is usually the
largest thing on the first screen and the paint a reader waits for. Left to
the defaults it comes late: an image block loads lazily, and a background is
found only once the page's stylesheet applies to its block. So the first image
block or background image among a page's first two top-level blocks
(`content/blocks/image/leadImage.ts`) is fetched first:

- an image block loads at once, with `fetchpriority="high"`, instead of
  lazily — found in the markup by the browser's first pass;
- a background is announced in the document's head, one
  `<link rel="preload" as="image" fetchpriority="high">` per canvas tier with
  that tier's copies and the viewports of that tier, so the browser fetches it
  while it still reads the page.

Every other image loads lazily, as the reader reaches it.

A phone must not fetch a desktop's copies on the way. A phone's browser
can lay a box out once against a box wider than the phone before the page
settles, and does so for a fixed box. The canvas inside such a box picks
each block's tier with its container queries, so it was styled at that
width for that moment, long enough to fetch the hero's desktop copy beside
the phone's. So the app's shell and the phone editor's fixed shell are held
to `max-width: 100vw`, which is the phone's own width from the start. An e2e on a phone's viewport checks the hero is
fetched once, as the phone's copy; it reads no layout while the page loads,
since doing so forces a layout that hides the pass that went wrong.
