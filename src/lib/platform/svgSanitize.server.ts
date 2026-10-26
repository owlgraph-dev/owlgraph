// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// SVG sanitizing for the branding logo, the only place SVG is accepted. Not
// re-exported from any barrel: the MCP server and the test harness must never
// load jsdom.
import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

// A type-only mismatch: jsdom's window has everything DOMPurify needs.
const purify = DOMPurify(new JSDOM('').window as unknown as Parameters<typeof DOMPurify>[0]);

// Stripped before parsing: DOMPurify sanitizes the parsed tree, too late for
// entity expansion (XXE, billion laughs). `[^>[]*` so a bracketed internal
// subset is matched whole, not cut at a nested declaration's '>'.
const DOCTYPE_OR_ENTITY = /<!DOCTYPE[^>[]*(\[[^\]]*\])?\s*>|<!ENTITY[^>]*>/gi;

export class SvgRejectedError extends Error {}

export function sanitizeSvg(raw: string): string {
  const stripped = raw.replace(DOCTYPE_OR_ENTITY, '');
  const clean = purify.sanitize(stripped, {
    USE_PROFILES: { svg: true, svgFilters: true },
    PARSER_MEDIA_TYPE: 'image/svg+xml',
    FORBID_TAGS: ['script', 'foreignObject'],
  });
  if (!clean || !/^\s*<svg[\s>]/i.test(clean)) {
    throw new SvgRejectedError('Not a valid SVG after sanitization.');
  }
  return clean;
}
