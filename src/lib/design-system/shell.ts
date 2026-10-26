// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The phone shell's query (docs/architecture/responsive.md, "Two kinds of breakpoint"): a
// phone-width window or one held sideways. Every chrome `@media` writes this
// exact text, which scripts/check-ui.mjs holds them to.
export const PHONE_SHELL_MEDIA = '(max-width: 640px), (pointer: coarse) and (max-height: 500px)';

// The compact chrome's query (docs/architecture/responsive.md, "Two kinds of breakpoint"):
// below it the settings sidebar and the search filters fold into a sheet and
// the editor's block settings panel overlays the canvas. A `@media` on 768 px writes this
// text, which scripts/check-ui.mjs holds it to; the search page adds the phone
// held sideways.
export const COMPACT_CHROME_MEDIA = '(max-width: 768px)';
