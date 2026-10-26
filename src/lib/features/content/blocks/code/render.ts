// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { esc } from '$lib/platform/htmlEscape';
import { attrsOf } from '../../doc/doc';
import type { CodeBlockAttrs } from './model';
import { blockIdAttribute, spaceAboveAttribute, type BlockRenderer } from '../blockRenderer';

export const renderCodeBlock: BlockRenderer = (node, ctx) => {
  const text = (node.content ?? []).map((n) => n.text ?? '').join('');
  const lang = attrsOf<CodeBlockAttrs>(node).language;
  const langClass = lang && lang !== 'plaintext' ? ` language-${esc(String(lang))}` : '';
  return `<pre${blockIdAttribute(node)}${spaceAboveAttribute(node, ctx)}><code class="hljs${langClass}">${ctx.highlightCode(text, lang)}</code></pre>`;
};
