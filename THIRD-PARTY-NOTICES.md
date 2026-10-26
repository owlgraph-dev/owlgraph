# Third-party notices

owlgraph is licensed under the GNU Affero General Public License 3.0 (see
[`LICENSE`](LICENSE) and [`PLUGIN-EXCEPTION.md`](PLUGIN-EXCEPTION.md)). It
contains some work by others and is built with many open-source packages.
This file covers what is copied into owlgraph's own source; the packages it
depends on, with their licence texts, are listed in
[`static/licenses.txt`](static/licenses.txt), which every running instance
serves at `/licenses.txt` and which `npm run notices` regenerates from
`package-lock.json`.

## Icons

### Feather

Most of the interface's line icons are glyphs from
[Feather](https://github.com/feathericons/feather) (version 4.29.2), copied
as SVG path data, some of them adapted: `src/lib/design-system/icons.ts`,
`src/lib/design-system/Icon.svelte` and
`src/lib/design-system/NavigationMenu.svelte`.

```
The MIT License (MIT)

Copyright (c) 2013-2023 Cole Bemis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Lucide

The chevron of `src/lib/design-system/Select.svelte`,
`src/lib/design-system/MultiSelect.svelte` and
`src/lib/design-system/AccordionItem.svelte`, and the `monitor` glyph in
`src/lib/design-system/Icon.svelte`, are from
[Lucide](https://github.com/lucide-icons/lucide) (version 0.460.0).

```
ISC License

Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2022.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```

## Typeface

The wordmark in the logo lockups (`src/lib/assets/owlgraph-lockup-ink.svg`,
`src/lib/assets/owlgraph-lockup-light.svg`) and on the social card
(`static/og-image.png`) is set in Schibsted Grotesk, a typeface under the
SIL Open Font License 1.1, and drawn as outlines. No font file is part of
owlgraph.

## Dependencies worth naming

The licence texts of all of these are in `static/licenses.txt`; the notes
below say what applies beyond reproducing them.

- **DOMPurify** (`dompurify`, in the browser bundle) is offered under
  `MPL-2.0 OR Apache-2.0`; owlgraph uses it under the **Apache License 2.0**.
- **PDF.js** (`pdfjs-dist`, Apache-2.0, on the server for text extraction)
  bundles fonts under their own licences: the Foxit fonts (BSD-style) and the
  Liberation fonts (SIL Open Font License 1.1).
- **libvips** (`@img/sharp-libvips-*`, used by `sharp` for images) is
  **LGPL-3.0-or-later**, and so are the libraries built into its binary
  (glib, pango, librsvg, libheif, libexif among them; cairo is MPL-1.1, aom
  BSD with a patent grant). npm installs a prebuilt binary for the platform.
  Its source, and how it is built, is at
  <https://github.com/lovell/sharp-libvips/tree/v1.3.4>. Whoever distributes
  an owlgraph image that contains the binary distributes libvips too, and
  must offer that source and the LGPL text with it.
- **Paraglide's plugins.** Compiling the interface messages
  (`npm run messages`, and every build) loads two inlang plugins,
  `@inlang/plugin-message-format` and `@inlang/plugin-m-function-matcher`
  (MIT), from the jsDelivr CDN, as `project.inlang/settings.json` names them.
  They are build tools; nothing of them ships in the app.
