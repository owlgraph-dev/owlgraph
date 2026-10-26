// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Paragraph styles (docs/architecture/typography.md): a style bundles the tag it renders as,
// a hidden base role whose built-in look it inherits, and an optional branding
// token over that. A block stores the style's id in `paragraphStyle`; the node's
// own tag stays authoritative, so resolution never changes it. A block with no
// or an unknown style resolves to its tag's default, so Enter, markdown `#` and
// heading shortcuts need no hook. A style's name is localized and never
// identifies it (docs/architecture/languages.md).
import type { Node as PmNode, NodeType } from '@tiptap/pm/model';
import type { Transaction } from '@tiptap/pm/state';
import { BUILTIN_ELEMENT_DEFAULTS, typographyRoleOverrideOrNull, type ElementDefaults, type TypographyRegistry, type TypographyRoleKey } from './roles';
import { WEIGHT_PRESETS, type WeightToken } from './typography';
import { sizePreviewRem, type TypeSize } from './typeScale';
import { resolveFontStack } from './fonts';
import { localize, type LocalizedText } from '$lib/platform/i18n/localizedText';

export const PARAGRAPH_STYLE_TAGS = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;
export type ParagraphStyleTag = (typeof PARAGRAPH_STYLE_TAGS)[number];

export function isParagraphStyleTag(v: unknown): v is ParagraphStyleTag {
  return typeof v === 'string' && (PARAGRAPH_STYLE_TAGS as readonly string[]).includes(v);
}

/** The built-in role a tag's own styles start from: a paragraph is body text, a heading its level. */
export function tagRole(tag: ParagraphStyleTag): TypographyRoleKey {
  return tag === 'p' ? 'body' : tag;
}

/** The heading level a tag renders at; null for a paragraph. */
export function headingLevelOf(tag: ParagraphStyleTag): 1 | 2 | 3 | 4 | 5 | 6 | null {
  return tag === 'p' ? null : (Number(tag.slice(1)) as 1 | 2 | 3 | 4 | 5 | 6);
}

/** A style as stored (settings UI, MCP): the token by reference, the name in every language. */
export interface ParagraphStyle {
  id: string;
  label: LocalizedText;
  renderAs: ParagraphStyleTag;
  baseRole: TypographyRoleKey;
  tokenId: string | null;
  isDefault: boolean;
  position: number;
}

/** A style as rendering needs it: its look already merged, its name resolved for the viewer. */
export interface ResolvedParagraphStyle {
  id: string;
  label: string;
  renderAs: ParagraphStyleTag;
  baseRole: TypographyRoleKey;
  isDefault: boolean;
  position: number;
  defaults: ElementDefaults;
}

/** The fields of a branding token that lay over a base role's defaults. */
export interface TokenLook {
  family: string | null;
  size: TypeSize | null;
  weight: WeightToken | null;
  lineHeight: number | null;
  letterSpacing: number | null;
}

// A token's set fields win; with no token the style is the built-in bundle.
export function mergeTokenOverDefaults(token: TokenLook | null | undefined, builtin: ElementDefaults): ElementDefaults {
  if (!token) return builtin;
  return {
    family: token.family ?? builtin.family,
    size: token.size ?? builtin.size,
    weight: token.weight ?? builtin.weight,
    lineHeight: token.lineHeight ?? builtin.lineHeight,
    letterSpacing: token.letterSpacing ?? builtin.letterSpacing,
  };
}

const TAG_ORDER: Record<ParagraphStyleTag, number> = { p: 0, h1: 1, h2: 2, h3: 3, h4: 4, h5: 5, h6: 6 };

const sortName = (label: string | LocalizedText): string => (typeof label === 'string' ? label : localize(label, ''));

/** Hierarchy order for pickers and the settings table: paragraph styles, then h1 → h6; within a tag the default first, then by position, then by name. */
export function sortParagraphStyles<T extends { renderAs: ParagraphStyleTag; isDefault: boolean; position: number; label: string | LocalizedText }>(styles: readonly T[]): T[] {
  return [...styles].sort(
    (a, b) =>
      TAG_ORDER[a.renderAs] - TAG_ORDER[b.renderAs] ||
      Number(b.isDefault) - Number(a.isDefault) ||
      a.position - b.position ||
      sortName(a.label).localeCompare(sortName(b.label))
  );
}

export function defaultParagraphStyleFor<T extends { renderAs: ParagraphStyleTag; isDefault: boolean }>(tag: ParagraphStyleTag, styles: readonly T[]): T | null {
  return styles.find((s) => s.renderAs === tag && s.isDefault) ?? null;
}

/** The tag a heading/paragraph node renders as, from its own attrs; null for any other node type. */
export function nodeTag(type: string, attrs: Record<string, unknown>): ParagraphStyleTag | null {
  if (type === 'paragraph') return 'p';
  if (type === 'heading') {
    const level = Math.min(Math.max(Number(attrs.level) || 1, 1), 6);
    return `h${level}` as ParagraphStyleTag;
  }
  return null;
}

export function paragraphStyleIdOrNull(v: unknown): string | null {
  return typeof v === 'string' && v !== '' ? v : null;
}

export interface ParagraphStyleResolution {
  /** The style the block resolves to; null only when the registry has none for its tag. */
  style: ResolvedParagraphStyle | null;
  tag: ParagraphStyleTag;
  /** What the block's typography falls back to — the style's look, or the tag's built-in bundle. */
  defaults: ElementDefaults;
}

/**
 * In order: the style `paragraphStyle` names, if it renders as the node's own tag
 * (toggleHeading/setNode copy attrs across types, so a paragraph style's id
 * can land on a heading); the style matching a stored `typographyRole`
 * override; the tag's default style; with no registry, the built-in look.
 */
export function resolveParagraphStyle(type: string, attrs: Record<string, unknown>, styles: readonly ResolvedParagraphStyle[]): ParagraphStyleResolution {
  const tag = nodeTag(type, attrs) ?? 'p';
  const id = paragraphStyleIdOrNull(attrs.paragraphStyle);
  const own = id ? styles.find((s) => s.id === id && s.renderAs === tag) : undefined;
  if (own) return { style: own, tag, defaults: own.defaults };
  const legacyRole = typographyRoleOverrideOrNull(attrs.typographyRole);
  const legacy = legacyRole ? styles.find((s) => s.renderAs === tag && s.baseRole === legacyRole) : undefined;
  if (legacy) return { style: legacy, tag, defaults: legacy.defaults };
  const fallback = defaultParagraphStyleFor(tag, styles);
  return { style: fallback, tag, defaults: fallback?.defaults ?? BUILTIN_ELEMENT_DEFAULTS[tagRole(tag)] };
}

/** The look of plain body text: the default paragraph style, for blocks that carry typography without being a paragraph (cells, cards). */
export function bodyDefaults(registry: TypographyRegistry): ElementDefaults {
  return defaultParagraphStyleFor('p', registry.paragraphStyles)?.defaults ?? BUILTIN_ELEMENT_DEFAULTS.body;
}

/**
 * A style's label in its own look, for the picker. Never `var(--type-*)`:
 * outside the canvas its cqi would resolve against the viewport.
 */
export function paragraphStylePreviewCss(style: ResolvedParagraphStyle, registry: TypographyRegistry): string {
  const parts: string[] = [];
  const stack = resolveFontStack(style.defaults.family, registry.customStacks);
  if (stack) parts.push(`font-family:${stack}`);
  if (style.defaults.weight) parts.push(`font-weight:${WEIGHT_PRESETS[style.defaults.weight]}`);
  parts.push(`font-size:${sizePreviewRem(style.defaults.size ?? 'scale:m')}`);
  return parts.join(';');
}

/**
 * Names a block's resolved style for the theme stylesheet's per-style rules
 * (emitParagraphStyles.ts). Not the stored `paragraphStyle`, which round-trips as
 * `data-paragraph-style`.
 */
export const PARAGRAPH_STYLE_DATA_ATTR = 'data-ps';

/** ` data-ps="<id>"` for the outermost element, or '' with no resolved style. */
export function paragraphStyleAttribute(style: Pick<ResolvedParagraphStyle, 'id'> | null | undefined): string {
  return style ? ` ${PARAGRAPH_STYLE_DATA_ATTR}="${style.id}"` : '';
}

// keepOnSplit is off so Enter after a styled block starts from the tag default.
export function paragraphStyleAttr() {
  return {
    default: null as string | null,
    keepOnSplit: false,
    parseHTML: (el: HTMLElement) => paragraphStyleIdOrNull(el.getAttribute('data-paragraph-style')),
    renderHTML: (attrs: Record<string, unknown>) => {
      const id = paragraphStyleIdOrNull(attrs.paragraphStyle);
      return id ? { 'data-paragraph-style': id } : {};
    },
  };
}

/** The text blocks a style applies to: heading, paragraph, and the transient empty placeholder (an empty page's first block, which typing turns into a paragraph). */
export const PARAGRAPH_STYLE_TEXTBLOCKS: ReadonlySet<string> = new Set(['heading', 'paragraph', 'placeholder']);

/**
 * Every text block in [from, to] takes the style's tag and id, clearing any
 * `typographyRole` override; a setNodeMarkup, so everything else is kept. A
 * block whose parent can't hold the target type is left alone. True if anything changed.
 */
export function applyParagraphStyle(tr: Transaction, from: number, to: number, style: Pick<ResolvedParagraphStyle, 'id' | 'renderAs'>): boolean {
  const schema = tr.doc.type.schema;
  const level = headingLevelOf(style.renderAs);
  const targetType: NodeType = level == null ? schema.nodes.paragraph : schema.nodes.heading;
  if (!targetType) return false;
  const targets: { pos: number; node: PmNode }[] = [];
  tr.doc.nodesBetween(from, to, (node, pos, parent, index) => {
    if (!PARAGRAPH_STYLE_TEXTBLOCKS.has(node.type.name)) return !node.isTextblock;
    if (parent && !parent.canReplaceWith(index, index + 1, targetType)) return false;
    targets.push({ pos, node });
    return false;
  });
  for (const { pos, node } of targets) {
    const attrs: Record<string, unknown> = { ...node.attrs, paragraphStyle: style.id, typographyRole: null };
    if (level != null) attrs.level = level;
    else delete attrs.level;
    tr.setNodeMarkup(tr.mapping.map(pos), targetType, attrs, node.marks);
  }
  return targets.length > 0;
}
