// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Sanitizes the editor's live preview of an HTML block, which would otherwise
// render an author's unsaved input raw. The enforced boundary is
// render/sanitize.server.ts on every save; this is a safety net and needs no
// policy parity. DOMPurify, since sanitize-html is not meant for browsers.
// EXTRA_TAGS are ones the server allows too, so the preview isn't stripped.
import DOMPurify from 'dompurify';

const EXTRA_TAGS = ['img', 'figure', 'figcaption', 'h1', 'h2', 'section', 'article', 'mark', 'details', 'summary'];

export function sanitizeHtmlBlockPreview(html: string): string {
  return DOMPurify.sanitize(html, { ADD_TAGS: EXTRA_TAGS });
}
