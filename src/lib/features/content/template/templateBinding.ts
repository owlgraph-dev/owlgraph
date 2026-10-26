// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Binds a query template per result (docs/architecture/dynamic-rendering.md). A parameter
// is a semanticProperty mark: its propName is the key, the marked text the
// placeholder. The template is cloned per result with each value filled in,
// before the ordinary renderDoc walk, which knows nothing of templating. An
// optional `mapping` redirects a key to another source or applies a
// transform; a key without one binds by direct match.
import { esc } from '$lib/platform/htmlEscape';
import { applyTransform, type TransformSpec } from './templateTransforms';
import { replaceHtmlParamTokens } from './templateParams';

export interface ResultProperties {
  id: string;
  title: string;
  url: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
  type: string;
  // Labels, never ids: a template author never sees a UUID. creatorLabel is ''
  // without a creator; classLabel is never empty (at least the type class).
  namespaceLabel: string;
  creatorLabel: string;
  classLabel: string;
  // A link document's external URL, '' otherwise; `url` is the node's own page.
  externalUrl: string;
  locale: string;
  properties: { name: string; value: string }[];
}

export interface ParamMapping {
  source: string;
  transform?: TransformSpec | null;
}

export type WrapperMapping = Record<string, ParamMapping>;

import type { JsonNode } from '../doc/doc';

// The node's intrinsic fields (query/nodeFilter.ts, IntrinsicField) as reserved
// keys, under the result's real properties: a property of the same name wins.
function bindingMap(item: ResultProperties): Map<string, string> {
  const map = new Map<string, string>();
  map.set('title', item.title);
  map.set('url', item.url);
  map.set('slug', item.slug);
  map.set('createdAt', item.createdAt);
  map.set('updatedAt', item.updatedAt);
  map.set('type', item.type);
  map.set('namespace', item.namespaceLabel);
  map.set('creator', item.creatorLabel);
  map.set('class', item.classLabel);
  map.set('externalUrl', item.externalUrl);
  map.set('locale', item.locale);
  for (const a of item.properties) map.set(a.name, a.value);
  return map;
}

// A parameter with no value in this result keeps its placeholder text.
export function bindTemplate(subtree: JsonNode, item: ResultProperties, mapping?: WrapperMapping | null): JsonNode {
  const map = bindingMap(item);

  // Transforms never throw (templateTransforms.ts), so no type is needed here.
  function resolve(key: string): string | undefined {
    const m = mapping?.[key];
    const source = m?.source ?? key;
    const raw = map.get(source);
    if (raw === undefined) return undefined;
    return m?.transform ? applyTransform(raw, m.transform) : raw;
  }

  function walk(node: JsonNode): JsonNode {
    if (!node || typeof node !== 'object') return node;

    if (node.type === 'text' && typeof node.text === 'string') {
      const mark = (node.marks ?? []).find((m) => m.type === 'semanticProperty');
      const key = mark?.attrs?.propName;
      const value = typeof key === 'string' && key ? resolve(key) : undefined;
      if (value !== undefined) return { ...node, text: value };
      return node;
    }

    // The one place query data meets raw HTML: a {{{key}}} token gets the
    // ESCAPED value (a value is never live markup), and the render-time
    // sanitizer runs on the result (substitute-then-sanitize).
    if (node.type === 'htmlBlock' && typeof node.attrs?.html === 'string') {
      const html = replaceHtmlParamTokens(node.attrs.html, (key) => {
        const value = resolve(key);
        return value !== undefined ? esc(value) : undefined;
      });
      return { ...node, attrs: { ...node.attrs, html } };
    }

    if (Array.isArray(node.content)) {
      return { ...node, content: node.content.map(walk) };
    }
    return node;
  }

  return walk(subtree);
}
