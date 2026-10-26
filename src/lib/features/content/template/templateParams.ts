// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Query-template parameters: a semanticProperty mark under the reserved
// `parameter:` group, or inside an HTML block a {{{key}}} / {{{key:type}}}
// token. The renderer and the mapping UI share this one token grammar, so
// what the mapping shows and what is substituted can't drift apart.
import { isPropertyDatatype } from '$lib/features/semantic';

// `key` is a mark's full propName or a token's key as written; `inHtml` tells
// a mark `parameter:x` from a token `{{{x}}}`, which both display as "x".
export interface TemplateParam {
  key: string;
  declaredType: string | null;
  inHtml?: boolean;
}

// ':' belongs to namespaced keys ("core:status") and to the `:type` suffix alike.
export const HTML_PARAM_TOKEN_RE = /\{\{\{([\w:-]+)\}\}\}/g;

// The type suffix counts only when the last segment is a datatype and
// something precedes it:
//   {{{core:status}}}       -> key "core:status",  untyped
//   {{{core:status:date}}}  -> key "core:status",  type "date"
// So {{{core:date}}} reads as key "core" typed date; the mapping UI shows it.
// Untyped is null, not 'text', or every untyped token would warn of a mismatch.
export function parseHtmlParamToken(inner: string): { key: string; declaredType: string | null } {
  const i = inner.lastIndexOf(':');
  if (i > 0) {
    const tail = inner.slice(i + 1);
    if (isPropertyDatatype(tail)) return { key: inner.slice(0, i), declaredType: tail };
  }
  return { key: inner, declaredType: null };
}

// The caller escapes: the renderer passes HTML-escaped values. An unbound token stays literal.
export function replaceHtmlParamTokens(html: string, resolve: (key: string) => string | undefined): string {
  return html.replace(HTML_PARAM_TOKEN_RE, (full: string, inner: string) => {
    const value = resolve(parseHtmlParamToken(inner).key);
    return value !== undefined ? value : full;
  });
}

// The first occurrence that declares a type wins; `inHtml` sticks.
export function mergeTemplateParam(params: Map<string, TemplateParam>, p: TemplateParam): void {
  const existing = params.get(p.key);
  if (!existing) {
    params.set(p.key, p.inHtml ? { key: p.key, declaredType: p.declaredType, inHtml: true } : { key: p.key, declaredType: p.declaredType });
    return;
  }
  if (!existing.declaredType && p.declaredType) existing.declaredType = p.declaredType;
  if (p.inHtml) existing.inHtml = true;
}

export function collectHtmlBlockParams(html: string): TemplateParam[] {
  const params = new Map<string, TemplateParam>();
  for (const m of html.matchAll(HTML_PARAM_TOKEN_RE)) {
    const { key, declaredType } = parseHtmlParamToken(m[1]);
    mergeTemplateParam(params, { key, declaredType, inHtml: true });
  }
  return [...params.values()];
}
