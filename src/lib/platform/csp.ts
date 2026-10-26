// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Content-Security-Policy, the style half (docs/architecture/overview.md, "Content
// Security Policy"). SvelteKit emits the header from kit.csp; this module
// rewrites `style-src` per route class:
//   strict  the reader's pages: 'self' and a style nonce, no style attributes
//           (per-block overrides go in the per-page sheet, pageStyles.ts).
//   loose   tools whose libraries write style attributes: 'unsafe-inline' and
//           no nonce, since a nonce would switch 'unsafe-inline' off.
//   frame   the Mermaid render frame: loose, framable by this origin only.
// `vite dev` adds 'unsafe-inline' and drops nonces, so only the built app is strict.

import { safeUrl } from './safeUrl';

export type StyleSrcPhase = 'report-only' | 'enforce';

/**
 * A constant, not an environment variable, so no deployment can quietly
 * un-enforce it. 'report-only' sends the strict policy as
 * Content-Security-Policy-Report-Only beside the loose one, to diagnose a violation.
 */
export const STYLE_SRC_PHASE: StyleSrcPhase = 'enforce';

export type StyleRouteKind = 'strict' | 'loose' | 'frame';

export const CSP_REPORT_PATH = '/api/csp-report';

/**
 * Style attributes a strict route allows by hash (`'unsafe-hashes'`): fixed,
 * harmless strings a dependency writes where no nonce reaches. A last resort:
 * what the app renders goes in the per-page sheet. csp.test.ts recomputes each
 * hash and finds its string in the installed dependency.
 */
export const HASHED_STYLE_ATTRIBUTES = [
  {
    // app.css carries the same rules, so it stays hidden if this string changes.
    what: "SvelteKit's route announcer",
    source: 'node_modules/@sveltejs/kit/src/core/sync/write_root.js',
    style:
      'position: absolute; left: 0; top: 0; clip: rect(0 0 0 0); clip-path: inset(50%); overflow: hidden; white-space: nowrap; width: 1px; height: 1px',
    hash: 'sha256-S8qMpvofolR8Mpjy4kQvEm7m1q8clzU4dfDH0AmvZjo=',
  },
  {
    // On every Command item and group wrapper, with no opt-out, and the search
    // overlay is on every route. `display: contents` gives nothing to abuse.
    what: "bits-ui's Command item wrappers",
    source: 'node_modules/bits-ui/dist/bits/command/components/command-item.svelte',
    style: 'display: contents;',
    hash: 'sha256-iaOezIDcQIoxCULa6FBKKuLUu09R7kG+Mlu+JVfU3Rw=',
  },
] as const;

/**
 * A path's route class, as cspRoutes.ts assigns it by route id. A policy
 * belongs to the document, so a navigation that crosses classes must be a full one.
 */
export function styleRouteKindForPath(pathname: string): StyleRouteKind {
  const path = pathname.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  if (path === '/api/embed/mermaid') return 'frame';
  if (path === '/settings' || path.startsWith('/settings/') || path.startsWith('/dev/') || path.endsWith('/edit')) return 'loose';
  return 'strict';
}

/** True when `fromPath` and `toPath` are in different route classes. */
export function crossesStylePolicy(fromPath: string, toPath: string): boolean {
  return styleRouteKindForPath(fromPath) !== styleRouteKindForPath(toPath);
}

/** 16 random bytes, base64: the shape of SvelteKit's own nonce. */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/** `directive-name source source; …` → ordered map (insertion order kept for serialize). */
export function parseCsp(header: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const part of header.split(';')) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    const [name, ...sources] = tokens;
    out.set(name.toLowerCase(), sources);
  }
  return out;
}

export function serializeCsp(directives: Map<string, string[]>): string {
  return Array.from(directives, ([name, sources]) => [name, ...sources].join(' ')).join('; ');
}

const CRYPTO_SOURCE = /^'(nonce|sha256|sha384|sha512)-/;

/** A directive's sources without the inline mechanisms this module decides about. */
function baseSources(directives: Map<string, string[]>): string[] {
  const own = directives.get('style-src') ?? directives.get('default-src') ?? ["'self'"];
  return own.filter((s) => s !== "'unsafe-inline'" && !CRYPTO_SOURCE.test(s));
}

/**
 * Lets the render frame be framed by this origin only; kit.csp sets
 * `frame-ancestors 'none'`. Apart from the style rewrite: dev needs it too.
 */
export function allowSelfFraming(header: string): string {
  const directives = parseCsp(header);
  directives.set('frame-ancestors', ["'self'"]);
  return serializeCsp(directives);
}

/**
 * Rewrites `style-src` (and the frame's `frame-ancestors`) on SvelteKit's
 * header; `reportOnly` is set in the report-only phase on a strict route.
 */
export function applyStylePolicy(
  header: string,
  opts: { kind: StyleRouteKind; nonce: string; phase: StyleSrcPhase; reportUri?: string }
): { csp: string; reportOnly: string | null } {
  const directives = parseCsp(header);
  const base = baseSources(directives).filter((s) => s !== "'unsafe-hashes'");
  const strict = [...base, `'nonce-${opts.nonce}'`, "'unsafe-hashes'", ...HASHED_STYLE_ATTRIBUTES.map((a) => `'${a.hash}'`)];
  const loose = [...base, "'unsafe-inline'"];

  if (opts.kind === 'strict' && opts.phase === 'enforce') {
    directives.set('style-src', strict);
    return { csp: serializeCsp(directives), reportOnly: null };
  }

  directives.set('style-src', loose);
  const csp = opts.kind === 'frame' ? allowSelfFraming(serializeCsp(directives)) : serializeCsp(directives);

  if (opts.kind === 'strict') {
    const reportOnly = new Map<string, string[]>([['style-src', strict]]);
    reportOnly.set('report-uri', [opts.reportUri ?? CSP_REPORT_PATH]);
    return { csp, reportOnly: serializeCsp(reportOnly) };
  }
  return { csp, reportOnly: null };
}

const REPORT_FIELD_MAX = 200;

function field(source: Record<string, unknown>, ...names: string[]): string {
  for (const name of names) {
    const value = source[name];
    if (typeof value === 'string' && value) return value.replace(/\s+/g, ' ').slice(0, REPORT_FIELD_MAX);
    if (typeof value === 'number') return String(value);
  }
  return '-';
}

/**
 * URL fields go through safeUrl, never verbatim: `document-uri` can be a
 * /share/<token> path, which is the capability, and `blocked-uri` any origin
 * (docs/architecture/logging.md, "URLs in logs").
 */
function urlField(source: Record<string, unknown>, origin: string | undefined, ...names: string[]): string {
  for (const name of names) {
    const value = source[name];
    if (typeof value === 'string' && value) return safeUrl(value, { origin }) || '-';
  }
  return '-';
}

export interface CspViolationFields {
  directive: string;
  blocked: string;
  source: string;
  document: string;
  referrer: string;
}

/**
 * One record per violation in a legacy `report-uri` or Reporting API body;
 * empty when it is not a report. `origin` keeps this app's URLs as route
 * patterns. Never read: `sample` (authored content) and `original-policy`
 * (it carries the style nonce).
 */
export function summarizeCspReport(body: unknown, opts: { origin?: string } = {}): CspViolationFields[] {
  const reports: Record<string, unknown>[] = [];
  if (Array.isArray(body)) {
    for (const entry of body) {
      const inner = entry && typeof entry === 'object' ? (entry as { body?: unknown }).body : null;
      if (inner && typeof inner === 'object') reports.push(inner as Record<string, unknown>);
    }
  } else if (body && typeof body === 'object') {
    const legacy = (body as { 'csp-report'?: unknown })['csp-report'];
    if (legacy && typeof legacy === 'object') reports.push(legacy as Record<string, unknown>);
  }
  const url = (r: Record<string, unknown>, ...names: string[]) => urlField(r, opts.origin, ...names);
  return reports.map((r) => ({
    directive: field(r, 'effective-directive', 'effectiveDirective', 'violated-directive', 'violatedDirective'),
    blocked: url(r, 'blocked-uri', 'blockedURL', 'blockedURI'),
    source: `${url(r, 'source-file', 'sourceFile')}:${field(r, 'line-number', 'lineNumber')}`,
    document: url(r, 'document-uri', 'documentURL', 'documentURI'),
    referrer: url(r, 'referrer'),
  }));
}
