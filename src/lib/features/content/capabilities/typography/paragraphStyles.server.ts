// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Paragraph styles, the stored side (docs/architecture/typography.md). Exactly one default
// per tag is kept here, not by the schema: the partial unique index only
// allows at most one, so a default swaps in one transaction and can't be deleted.
import { db, type TxSql } from '$lib/platform/db.server';
import { hasText, localize, type LocalizedText } from '$lib/platform/i18n/localizedText';
import { localizedJson, parseLocalizedText } from '$lib/platform/i18n/localizedText.server';
import { isTypographyRoleKey, BUILTIN_ELEMENT_DEFAULTS, type TypographyRoleKey } from './roles';
import { isParagraphStyleTag, mergeTokenOverDefaults, sortParagraphStyles, tagRole, type ParagraphStyle, type ParagraphStyleTag, type ResolvedParagraphStyle, type TokenLook } from './paragraphStyles';
import { weightOrNull } from './typography';
import { sizeOrNull } from './typeScale';
import { CodedError } from '$lib/platform/codedError';

interface Row {
  id: string;
  label: LocalizedText;
  render_as: string;
  base_role: string;
  token_id: string | null;
  is_default: boolean;
  position: number;
}

function rowToStyle(r: Row): ParagraphStyle {
  const renderAs: ParagraphStyleTag = isParagraphStyleTag(r.render_as) ? r.render_as : 'p';
  const baseRole: TypographyRoleKey = isTypographyRoleKey(r.base_role) ? r.base_role : tagRole(renderAs);
  return { id: r.id, label: r.label ?? {}, renderAs, baseRole, tokenId: r.token_id, isDefault: r.is_default, position: r.position };
}

const MAX_PARAGRAPH_STYLE_LABEL = 64;

/** A name has text in some language, and none of its translations runs past the limit. */
function isValidParagraphStyleLabel(label: LocalizedText): boolean {
  return hasText(label) && Object.values(label).every((text) => (text ?? '').length <= MAX_PARAGRAPH_STYLE_LABEL);
}

// The baseline's seed rows of paragraph_styles; keep the two in step. It
// re-creates the rows a test harness's cascading truncate removes.
export const SEED_PARAGRAPH_STYLES: readonly Pick<ParagraphStyle, 'label' | 'renderAs' | 'baseRole' | 'isDefault' | 'position'>[] = [
  { label: { en: 'Body text', de: 'Fließtext' }, renderAs: 'p', baseRole: 'body', isDefault: true, position: 0 },
  { label: { en: 'Title', de: 'Titel' }, renderAs: 'h1', baseRole: 'h1', isDefault: true, position: 1 },
  { label: { en: 'Subtitle', de: 'Untertitel' }, renderAs: 'h2', baseRole: 'h2', isDefault: true, position: 2 },
  { label: { en: 'Heading 3', de: 'Überschrift 3' }, renderAs: 'h3', baseRole: 'h3', isDefault: true, position: 3 },
  { label: { en: 'Heading 4', de: 'Überschrift 4' }, renderAs: 'h4', baseRole: 'h4', isDefault: true, position: 4 },
  { label: { en: 'Heading 5', de: 'Überschrift 5' }, renderAs: 'h5', baseRole: 'h5', isDefault: true, position: 5 },
  { label: { en: 'Heading 6', de: 'Überschrift 6' }, renderAs: 'h6', baseRole: 'h6', isDefault: true, position: 6 },
  { label: { en: 'Display', de: 'Display' }, renderAs: 'h1', baseRole: 'display', isDefault: false, position: 7 },
  { label: { en: 'Label', de: 'Label' }, renderAs: 'p', baseRole: 'label', isDefault: false, position: 8 },
];

/** Re-creates the seeded styles when the table is empty; a no-op otherwise. */
export async function seedParagraphStylesIfEmpty(sql: TxSql = db): Promise<void> {
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from paragraph_styles`;
  if (n > 0) return;
  for (const s of SEED_PARAGRAPH_STYLES) {
    await sql`insert into paragraph_styles (label, render_as, base_role, is_default, position) values (${localizedJson(sql, s.label)}, ${s.renderAs}, ${s.baseRole}, ${s.isDefault}, ${s.position})`;
  }
}

/** Every style, in hierarchy order, the token by reference. */
export async function listParagraphStyles(): Promise<ParagraphStyle[]> {
  const rows = await db<Row[]>`select id, label, render_as, base_role, token_id, is_default, position from paragraph_styles`;
  return sortParagraphStyles(rows.map(rowToStyle));
}

// The read every render path takes. A deleted token is nulled by the FK, which
// leaves the built-in look.
export async function getParagraphStyles(): Promise<ResolvedParagraphStyle[]> {
  const rows = await db<(Row & { t_family: string | null; t_size: string | null; t_weight: string | null; t_line_height: string | number | null; t_letter_spacing: string | number | null })[]>`
    select s.id, s.label, s.render_as, s.base_role, s.token_id, s.is_default, s.position,
           t.family as t_family, t.size as t_size, t.weight as t_weight, t.line_height as t_line_height, t.letter_spacing as t_letter_spacing
    from paragraph_styles s
    left join typography_tokens t on t.id = s.token_id`;
  return sortParagraphStyles(
    rows.map((r) => {
      const style = rowToStyle(r);
      const token: TokenLook | null = r.token_id
        ? {
            family: r.t_family,
            size: sizeOrNull(r.t_size),
            weight: weightOrNull(r.t_weight),
            lineHeight: r.t_line_height != null ? Number(r.t_line_height) : null,
            letterSpacing: r.t_letter_spacing != null ? Number(r.t_letter_spacing) : null,
          }
        : null;
      const { tokenId: _tokenId, ...rest } = style;
      return { ...rest, label: localize(style.label, style.id), defaults: mergeTokenOverDefaults(token, BUILTIN_ELEMENT_DEFAULTS[style.baseRole]) };
    })
  );
}

export interface ParagraphStyleInput {
  label: LocalizedText;
  renderAs: ParagraphStyleTag;
  tokenId: string | null;
}

function validLabel(label: LocalizedText): LocalizedText {
  const parsed = parseLocalizedText(label);
  if (!isValidParagraphStyleLabel(parsed)) throw new CodedError('invalid_style_name', `Enter a style name (max ${MAX_PARAGRAPH_STYLE_LABEL} characters).`, { max: MAX_PARAGRAPH_STYLE_LABEL });
  return parsed;
}

// Unique per language. The pre-check is the only guard: a unique index can't
// read a JSONB object.
async function assertLabelFree(label: LocalizedText, exceptId: string | null): Promise<void> {
  const rows = await db<{ id: string }[]>`
    select o.id from paragraph_styles o, jsonb_each_text(o.label) taken, jsonb_each_text(${localizedJson(db, label)}) wanted
    where taken.key = wanted.key and lower(taken.value) = lower(wanted.value)
      and o.id <> ${exceptId ?? '00000000-0000-0000-0000-000000000000'}
    limit 1`;
  if (rows.length) throw new CodedError('style_name_taken', 'A style with this name already exists.');
}

// Display and label bases exist only on the seeded rows.
export async function createParagraphStyle(input: ParagraphStyleInput): Promise<{ id: string }> {
  const label = validLabel(input.label);
  if (!isParagraphStyleTag(input.renderAs)) throw new CodedError('invalid_tag', 'Invalid tag.');
  await assertLabelFree(label, null);
  const [row] = await db<{ id: string }[]>`
    insert into paragraph_styles (label, render_as, base_role, token_id, position)
    values (${localizedJson(db, label)}, ${input.renderAs}, ${tagRole(input.renderAs)}, ${input.tokenId || null},
            (select coalesce(max(position), -1) + 1 from paragraph_styles))
    returning id`;
  return { id: row.id };
}

// The tag is fixed at creation: content keeps its own level, so a changed tag
// would disagree with every block using the style.
export async function updateParagraphStyle(id: string, input: { label: LocalizedText; tokenId: string | null }): Promise<void> {
  const label = validLabel(input.label);
  await assertLabelFree(label, id);
  await db`update paragraph_styles set label = ${localizedJson(db, label)}, token_id = ${input.tokenId || null} where id = ${id}`;
}

export async function setParagraphStyleToken(id: string, tokenId: string | null): Promise<void> {
  await db`update paragraph_styles set token_id = ${tokenId || null} where id = ${id}`;
}

// One transaction, so the partial unique index never sees two defaults and there is never none.
export async function setDefaultParagraphStyle(id: string): Promise<void> {
  await db.begin(async (tx) => {
    const [row] = await tx<{ render_as: string }[]>`select render_as from paragraph_styles where id = ${id}`;
    if (!row) throw new CodedError('not_found', 'Style not found.');
    await tx`update paragraph_styles set is_default = false where render_as = ${row.render_as} and is_default`;
    await tx`update paragraph_styles set is_default = true where id = ${id}`;
  });
}

// Content naming a deleted style resolves to its tag's default; no rewrite needed.
export async function deleteParagraphStyle(id: string): Promise<void> {
  const [row] = await db<{ is_default: boolean }[]>`select is_default from paragraph_styles where id = ${id}`;
  if (!row) return;
  if (row.is_default) throw new CodedError('default_style_undeletable', 'This style is the default for its tag. Make another style the default first.');
  await db`delete from paragraph_styles where id = ${id}`;
}
