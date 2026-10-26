// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// THE security boundary for html blocks: every page write, from the editor or
// an agent, runs sanitizeDoc before the database (pages.server.ts). Never
// render html that hasn't been through this.
//
// Writing is denied to viewers (nodes/access.ts, canWriteNode), so the threat
// is editor mistakes and self-XSS: the allowlist is generous, bounded by no
// script-capable tags, no event handlers, no url() in CSS and no
// position/z-index/viewport-cover CSS (clickjacking the app chrome). The
// nonce-based script-src is the backstop for scripts, but not for styles:
// allowed declarations are lifted into the nonce'd per-page stylesheet, and
// the editor routes allow 'unsafe-inline', so this allowlist is the only
// control for style safety.
//
// package.json overrides sanitize-html's htmlparser2 to ^10: 11 is ESM-only, which
// breaks under Playwright's module loader. The newer parser fixes concern tags
// (<textarea>, <xmp>, SVG animation) this allowlist never admits.
import sanitizeHtml from 'sanitize-html';
import { logEvent, logger } from '$lib/platform/logger.server';
import type { Attrs, JsonDoc, JsonNode } from '../doc/doc';
import { safeLinkHref } from './linkHref';
import { TYPE_SCALE_STEPS } from '../capabilities/typography/typeScale';
import { parseStyleText } from '../capabilities/overrides';
import { RULE_ID_ATTR, type StyleCollector } from '../capabilities/pageStyles';

// No vh/vw at all, so no length below can express "the whole viewport".
const LEN = String.raw`(?:0|-?\d{1,4}(?:\.\d{1,3})?(?:px|em|rem|%))`;
const ULEN = String.raw`(?:0|\d{1,4}(?:\.\d{1,3})?(?:px|em|rem|%))`; // non-negative
const NUM = String.raw`(?:-?\d{1,3}(?:\.\d{1,3})?)`; // unitless
const UNUM = String.raw`(?:\d{1,3}(?:\.\d{1,3})?)`;
const DEG = String.raw`(?:-?\d{1,3}(?:\.\d{1,2})?deg)`;
const TYPE_VAR = String.raw`var\(--type-(?:${TYPE_SCALE_STEPS.join('|')})\)`;

// Every function form takes numeric arguments only, so none can carry url() or expression().
const COLOR_FRAG = String.raw`(?:#[0-9a-f]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*(?:0|1|0?\.\d{1,3})\s*)?\)|hsla?\(\s*\d{1,3}\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%\s*(?:,\s*(?:0|1|0?\.\d{1,3})\s*)?\)|[a-z]+)`;
const COLOR = new RegExp(`^${COLOR_FRAG}$`, 'i');

// Fully anchored, so nothing can be smuggled in after a valid-looking prefix.
const box1to4 = (token: string) => new RegExp(`^${token}(?:\\s+${token}){0,3}$`);
const box1to2 = (token: string) => new RegExp(`^${token}(?:\\s+${token}){0,1}$`);

const BORDER_STYLE = '(?:none|hidden|solid|dashed|dotted|double|groove|ridge|inset|outset)';
const BORDER_SHORTHAND = new RegExp(`^(?:${ULEN}\\s+)?${BORDER_STYLE}(?:\\s+${COLOR_FRAG})?$`, 'i');

// box-shadow: [inset] x y [blur] [spread] [color], one or two shadows.
const BOX_SHADOW_ONE = String.raw`(?:inset\s+)?${LEN}\s+${LEN}(?:\s+${ULEN})?(?:\s+${LEN})?(?:\s+${COLOR_FRAG})?`;
const BOX_SHADOW = new RegExp(`^${BOX_SHADOW_ONE}(?:\\s*,\\s*${BOX_SHADOW_ONE})?$`, 'i');

// Only repeat() and minmax(), with numeric or keyword arguments: no other parens.
const GRID_TRACK = String.raw`(?:${ULEN}|\d{1,3}fr|auto|min-content|max-content)`;
const GRID_MINMAX = String.raw`minmax\(\s*${GRID_TRACK}\s*,\s*${GRID_TRACK}\s*\)`;
const GRID_REPEAT = String.raw`repeat\(\s*(?:\d{1,3}|auto-fill|auto-fit)\s*,\s*(?:${GRID_TRACK}|${GRID_MINMAX})(?:\s+(?:${GRID_TRACK}|${GRID_MINMAX})){0,5}\s*\)`;
const GRID_ITEM = String.raw`(?:${GRID_TRACK}|${GRID_MINMAX}|${GRID_REPEAT})`;
const GRID_TRACK_LIST = new RegExp(`^${GRID_ITEM}(?:\\s+${GRID_ITEM}){0,11}$`);

// Numeric transform functions only, up to four.
const TRANSFORM_TRANSLATE = String.raw`translate(?:X|Y)?\(\s*${LEN}(?:\s*,\s*${LEN})?\s*\)`;
const TRANSFORM_SCALE = String.raw`scale(?:X|Y)?\(\s*${NUM}(?:\s*,\s*${NUM})?\s*\)`;
const TRANSFORM_ROTATE = String.raw`rotate\(\s*${DEG}\s*\)`;
const TRANSFORM_SKEW = String.raw`skew(?:X|Y)?\(\s*${DEG}(?:\s*,\s*${DEG})?\s*\)`;
const TRANSFORM_MATRIX = String.raw`matrix\(\s*${NUM}(?:\s*,\s*${NUM}){5}\s*\)`;
const TRANSFORM_FN = `(?:${TRANSFORM_TRANSLATE}|${TRANSFORM_SCALE}|${TRANSFORM_ROTATE}|${TRANSFORM_SKEW}|${TRANSFORM_MATRIX})`;
const TRANSFORM = new RegExp(`^${TRANSFORM_FN}(?:\\s+${TRANSFORM_FN}){0,3}$`);
const TRANSFORM_ORIGIN = new RegExp(
  `^(?:left|right|center|top|bottom|${LEN})(?:\\s+(?:left|right|center|top|bottom|${LEN}))?$`
);

const options: sanitizeHtml.IOptions = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat([
    'img', 'figure', 'figcaption', 'h1', 'h2', 'section', 'article', 'mark',
    'details', 'summary',
  ]),
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    // `style` is the riskiest allowance (CSS clickjacking and exfiltration):
    // allowedStyles value-validates every property and lists no position,
    // z-index or url()-bearing one.
    '*': ['class', 'style'],
    a: ['href', 'name', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
    // Carry no URL or handler, so allowing them by name is a complete control.
    td: ['colspan', 'rowspan', 'headers'],
    th: ['colspan', 'rowspan', 'scope', 'headers'],
  },
  allowedStyles: {
    '*': {
      color: [COLOR],
      'background-color': [COLOR],
      // One colour token only, so `background: url(x) red` fails. Unlisted
      // properties (background-image, cursor, content) are always dropped.
      background: [COLOR],

      // Exactly var(--type-<step>) from the closed step list, never an arbitrary var().
      'font-size': [new RegExp(`^(?:${ULEN}|${TYPE_VAR}|xx-small|x-small|small|medium|large|x-large|xx-large|smaller|larger)$`)],
      // No parens, so no url() or expression().
      'font-family': [/^[a-zA-Z0-9\s,'"-]+$/],
      'line-height': [new RegExp(`^(?:normal|${UNUM}|${ULEN})$`)],
      'letter-spacing': [new RegExp(`^(?:normal|${LEN})$`)],
      'word-spacing': [new RegExp(`^(?:normal|${LEN})$`)],
      'text-transform': [/^(uppercase|lowercase|capitalize|none)$/],
      'text-indent': [new RegExp(`^${LEN}$`)],
      'white-space': [/^(normal|nowrap|pre|pre-wrap|pre-line|break-spaces)$/],
      'word-break': [/^(normal|break-all|keep-all|break-word)$/],
      'overflow-wrap': [/^(normal|break-word|anywhere)$/],
      'vertical-align': [new RegExp(`^(?:baseline|sub|super|top|text-top|middle|bottom|text-bottom|${ULEN})$`)],
      'text-align': [/^(left|right|center|justify)$/],
      'font-weight': [/^\d+$/, /^(normal|bold|bolder|lighter)$/],
      'font-style': [/^(italic|normal)$/],
      'text-decoration': [/^(underline|line-through|none)$/],

      margin: [box1to4(LEN)], // negative margins are common & safe
      'margin-top': [new RegExp(`^${LEN}$`)],
      'margin-right': [new RegExp(`^${LEN}$`)],
      'margin-bottom': [new RegExp(`^${LEN}$`)],
      'margin-left': [new RegExp(`^${LEN}$`)],
      padding: [box1to4(ULEN)],
      'padding-top': [new RegExp(`^${ULEN}$`)],
      'padding-right': [new RegExp(`^${ULEN}$`)],
      'padding-bottom': [new RegExp(`^${ULEN}$`)],
      'padding-left': [new RegExp(`^${ULEN}$`)],

      border: [BORDER_SHORTHAND],
      'border-top': [BORDER_SHORTHAND],
      'border-right': [BORDER_SHORTHAND],
      'border-bottom': [BORDER_SHORTHAND],
      'border-left': [BORDER_SHORTHAND],
      'border-radius': [box1to4(ULEN)],

      width: [new RegExp(`^(?:auto|${ULEN})$`)],
      height: [new RegExp(`^(?:auto|${ULEN})$`)],
      'min-width': [new RegExp(`^(?:auto|${ULEN})$`)],
      'min-height': [new RegExp(`^(?:auto|${ULEN})$`)],
      'max-width': [new RegExp(`^(?:none|${ULEN})$`)],
      'max-height': [new RegExp(`^(?:none|${ULEN})$`)],
      'box-sizing': [/^(content-box|border-box)$/],
      'box-shadow': [BOX_SHADOW],
      outline: [BORDER_SHORTHAND],

      // No position or z-index: unlisted properties are always dropped.
      display: [/^(block|inline|inline-block|flex|inline-flex|grid|inline-grid|none|table|table-row|table-cell|list-item|contents)$/],

      flex: [new RegExp(`^(?:none|auto|initial|${UNUM}(?:\\s+${UNUM}(?:\\s+(?:${ULEN}|auto|content))?)?)$`)],
      'flex-grow': [new RegExp(`^${UNUM}$`)],
      'flex-shrink': [new RegExp(`^${UNUM}$`)],
      'flex-basis': [new RegExp(`^(?:auto|content|${ULEN})$`)],
      'flex-direction': [/^(row|row-reverse|column|column-reverse)$/],
      'flex-wrap': [/^(nowrap|wrap|wrap-reverse)$/],

      gap: [box1to2(ULEN)],
      'row-gap': [new RegExp(`^${ULEN}$`)],
      'column-gap': [new RegExp(`^${ULEN}$`)],

      'justify-content': [/^(flex-start|flex-end|center|space-between|space-around|space-evenly|start|end|normal|stretch)$/],
      'justify-items': [/^(flex-start|flex-end|center|start|end|normal|stretch)$/],
      'justify-self': [/^(flex-start|flex-end|center|start|end|normal|stretch|auto)$/],
      'align-items': [/^(flex-start|flex-end|center|stretch|baseline|start|end|normal)$/],
      'align-content': [/^(flex-start|flex-end|center|stretch|baseline|space-between|space-around|start|end|normal)$/],
      'align-self': [/^(flex-start|flex-end|center|stretch|baseline|start|end|normal|auto)$/],

      'grid-template-columns': [GRID_TRACK_LIST],
      'grid-template-rows': [GRID_TRACK_LIST],
      'grid-column': [new RegExp('^(?:auto|span\\s+\\d{1,2}|-?\\d{1,3}(?:\\s*/\\s*(?:-?\\d{1,3}|span\\s+\\d{1,2}))?)$')],
      'grid-row': [new RegExp('^(?:auto|span\\s+\\d{1,2}|-?\\d{1,3}(?:\\s*/\\s*(?:-?\\d{1,3}|span\\s+\\d{1,2}))?)$')],
      order: [/^-?\d{1,3}$/],

      float: [/^(left|right|none)$/],
      clear: [/^(left|right|both|none)$/],
      overflow: [/^(visible|hidden|auto|scroll|clip)$/],
      'overflow-x': [/^(visible|hidden|auto|scroll|clip)$/],
      'overflow-y': [/^(visible|hidden|auto|scroll|clip)$/],

      // Safe only because position/z-index stay blocked: transform alone
      // can't pin a fixed overlay over the app chrome.
      transform: [TRANSFORM],
      'transform-origin': [TRANSFORM_ORIGIN],
    },
  },
  allowedSchemes: ['https', 'http', 'mailto'],
  allowedSchemesByTag: { img: ['https', 'http', 'data'] },
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }),
  },
};

export function sanitizeFragment(html: string): string {
  const clean = sanitizeHtml(html, options);
  // A length delta is the cheap signal that the allowlist bit; what was dropped
  // isn't logged, since that would be the content. Not request-correlated: MCP
  // and version restore reach this too.
  if (clean.length !== html.length) {
    logEvent(logger, 'sanitizer.rejected', { kind: 'html-block', reason: 'content-dropped' });
  }
  return clean;
}

// For the reader's strict style-src: inline styles move into the per-page
// stylesheet as `data-b` rules. Two passes, because a transform in the first
// would see the raw attribute before the value rules filtered it.
const extractOptions: sanitizeHtml.IOptions = {
  ...options,
  allowedAttributes: {
    ...options.allowedAttributes,
    // No `style`: what the transform didn't move is dropped.
    '*': ['class', RULE_ID_ATTR],
  },
  transformTags: {
    ...options.transformTags,
    '*': (tagName, attribs) => {
      const { style, ...rest } = attribs;
      const id = style ? styleCollector!.add(parseStyleText(style)) : '';
      return { tagName, attribs: id ? { ...rest, [RULE_ID_ATTR]: id } : rest };
    },
  },
};
// Transforms take no context, so the collector rides in this slot for the
// synchronous second pass.
let styleCollector: StyleCollector | null = null;

export function sanitizeFragmentInto(html: string, styles: StyleCollector): string {
  const clean = sanitizeFragment(html);
  if (!/\sstyle\s*=/i.test(clean)) return clean;
  const previous = styleCollector;
  styleCollector = styles;
  try {
    return sanitizeHtml(clean, extractOptions);
  } finally {
    styleCollector = previous;
  }
}

// Attribute keys that reach an object's prototype chain when attributes are
// merged (Tiptap's mergeAttributes turns an own `__proto__` key into inherited
// DOM attributes, GHSA-cp6q-959q-f8rh). Never legitimate in a document.
const PROTOTYPE_KEYS = ['__proto__', 'constructor', 'prototype'];

function stripPrototypeKeys(attrs: Attrs): void {
  for (const key of PROTOTYPE_KEYS) {
    if (Object.hasOwn(attrs, key)) delete attrs[key];
  }
}

function sanitizeNode(node: JsonNode): void {
  if (node.attrs) stripPrototypeKeys(node.attrs);
  if (node.type === 'htmlBlock' && typeof node.attrs?.html === 'string') {
    node.attrs.html = sanitizeFragment(node.attrs.html);
  }
  for (const mark of node.marks ?? []) {
    if (!mark?.attrs) continue;
    stripPrototypeKeys(mark.attrs);
    // A link is its href and nothing else (inline/link.ts): an onclick sent
    // with it is not stored. Render applies the same rule.
    if (mark.type === 'link') mark.attrs = { href: safeLinkHref(mark.attrs.href) };
  }
  for (const child of node.content ?? []) {
    if (child && typeof child === 'object') sanitizeNode(child);
  }
}

// In place, at every depth: html blocks, link hrefs, prototype-reaching keys.
export function sanitizeDoc<T extends JsonDoc | null | undefined>(doc: T): T {
  if (doc) sanitizeNode(doc);
  return doc;
}
