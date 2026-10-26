// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Custom styles: storage and the compiled artifact (docs/architecture/custom-styles.md). The
// artifact is cached under a version read from the rows' updated_at, so a save
// needs no process-wide invalidation. Every write compiles first and refuses
// what the compiler rejects, so the settings UI is never the only guard.
import { createHash } from 'node:crypto';
import { db, type TxSql } from '$lib/platform/db.server';
import { LAYER_ORDER, inLayer } from '$lib/platform/cssLayers';
import { logEvent, logger } from '$lib/platform/logger.server';
import { compileFreeCss, compileStyleCss, compileStylesheets, keyframePrefix, type CompileSheet, type CssIssue, type StyleKind } from './customStyles/compile';
import { slugFromLabel, styleClass } from './customStyles/slug';
import type { CustomStyleRef } from '$lib/features/content';
import type { CustomStyleRow, StylesheetWithStyles } from './types';
import { CodedError } from '$lib/platform/codedError';

const STYLE_KINDS: readonly StyleKind[] = ['inline', 'block'];

const MAX_NAME = 80;
const MAX_LABEL = 80;
const MAX_CSS = 20_000;
const MAX_FREE_CSS = 100_000;

/** A compile failure, carried to the adapter so its issues can sit next to the field that caused them. */
export class CustomCssError extends CodedError {
  constructor(readonly issues: CssIssue[]) {
    super('invalid_css', issues[0]?.message ?? 'This CSS could not be used.');
    this.name = 'CustomCssError';
  }
}

interface SheetRow {
  id: string;
  name: string;
  position: number;
  enabled: boolean;
  free_css: string;
}

interface StyleRow extends CustomStyleRow {
  stylesheet_id: string;
}

/** Every site stylesheet with its named styles, both in cascade order. */
export async function listStylesheets(sql: TxSql = db): Promise<StylesheetWithStyles[]> {
  const sheets = await sql<SheetRow[]>`
    select id, name, position, enabled, free_css
    from stylesheets
    where scope_kind = 'site'
    order by position, name`;
  if (sheets.length === 0) return [];

  const styles = await sql<StyleRow[]>`
    select cs.id, cs.stylesheet_id, cs.slug, cs.label, cs.kind, cs.css, cs.position
    from custom_styles cs
    join stylesheets s on s.id = cs.stylesheet_id
    where s.scope_kind = 'site'
    order by cs.position, cs.label`;

  return sheets.map((sheet) => ({
    id: sheet.id,
    name: sheet.name,
    position: sheet.position,
    enabled: sheet.enabled,
    freeCss: sheet.free_css,
    styles: styles
      .filter((style) => style.stylesheet_id === sheet.id)
      .map(({ stylesheet_id: _ignored, ...style }) => style),
  }));
}

export async function getStylesheet(id: string): Promise<StylesheetWithStyles | null> {
  const sheets = await listStylesheets();
  return sheets.find((sheet) => sheet.id === id) ?? null;
}

function requireName(name: string, max: number, what: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new CodedError(what === 'label' ? 'label_required' : 'name_required', `Enter a ${what}.`);
  if (trimmed.length > max) throw new CodedError('too_long', `A ${what} may be at most ${max} characters.`, { max });
  return trimmed;
}

export async function createStylesheet(name: string): Promise<{ id: string }> {
  const clean = requireName(name, MAX_NAME, 'name');
  const [row] = await db<{ id: string }[]>`
    insert into stylesheets (scope_kind, name, position)
    values ('site', ${clean}, coalesce((select max(position) + 1 from stylesheets where scope_kind = 'site'), 0))
    returning id`;
  return { id: row.id };
}

export async function renameStylesheet(id: string, name: string): Promise<void> {
  const clean = requireName(name, MAX_NAME, 'name');
  await db`update stylesheets set name = ${clean}, updated_at = now() where id = ${id} and scope_kind = 'site'`;
}

export async function setStylesheetEnabled(id: string, enabled: boolean): Promise<void> {
  await db`update stylesheets set enabled = ${enabled}, updated_at = now() where id = ${id} and scope_kind = 'site'`;
}

export async function deleteStylesheet(id: string): Promise<void> {
  await db`delete from stylesheets where id = ${id} and scope_kind = 'site'`;
}

/** Swaps with the neighbour in cascade order, rewriting every position so duplicates settle. */
export async function moveStylesheet(id: string, direction: 'up' | 'down'): Promise<void> {
  await db.begin(async (tx) => {
    const rows = await tx<{ id: string }[]>`
      select id from stylesheets where scope_kind = 'site' order by position, name for update`;
    const index = rows.findIndex((row) => row.id === id);
    if (index === -1) return;
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= rows.length) return;
    [rows[index], rows[target]] = [rows[target], rows[index]];
    for (const [position, row] of rows.entries()) {
      await tx`update stylesheets set position = ${position}, updated_at = now() where id = ${row.id}`;
    }
  });
}

export async function saveFreeCss(id: string, css: string): Promise<void> {
  if (css.length > MAX_FREE_CSS) throw new CodedError('too_long', `Free CSS may be at most ${MAX_FREE_CSS} characters.`, { max: MAX_FREE_CSS });
  const result = compileFreeCss(css, keyframePrefix(id));
  if (result.issues.length > 0) {
    // The count only: a message can quote the admin's CSS (docs/architecture/logging.md, "Never logged").
    logEvent(logger, 'sanitizer.rejected', {
      kind: 'custom-css',
      reason: 'free-css-rejected',
      issueCount: result.issues.length,
    });
    throw new CustomCssError(result.issues);
  }
  await db`update stylesheets set free_css = ${css}, updated_at = now() where id = ${id} and scope_kind = 'site'`;
}

function validateKind(kind: string): StyleKind {
  if (!STYLE_KINDS.includes(kind as StyleKind)) throw new CodedError('invalid_style_kind', 'Choose a valid kind.');
  return kind as StyleKind;
}

function validateStyleCss(css: string, slug: string): void {
  if (css.length > MAX_CSS) throw new CodedError('too_long', `A style's CSS may be at most ${MAX_CSS} characters.`, { max: MAX_CSS });
  const result = compileStyleCss(css, slug);
  if (result.issues.length > 0) {
    logEvent(logger, 'sanitizer.rejected', {
      kind: 'custom-css',
      reason: 'named-style-rejected',
      issueCount: result.issues.length,
    });
    throw new CustomCssError(result.issues);
  }
}

export async function createCustomStyle(input: { stylesheetId: string; label: string; kind: string; css: string }): Promise<{ id: string }> {
  const label = requireName(input.label, MAX_LABEL, 'label');
  const kind = validateKind(input.kind);
  const base = slugFromLabel(label);

  // The class is one global name: a collision takes the next free suffix, and
  // the slug never changes afterwards.
  for (let attempt = 0; attempt < 50; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
    validateStyleCss(input.css, slug);
    try {
      const [row] = await db<{ id: string }[]>`
        insert into custom_styles (stylesheet_id, slug, label, kind, css, position)
        values (
          ${input.stylesheetId}, ${slug}, ${label}, ${kind}, ${input.css},
          coalesce((select max(position) + 1 from custom_styles where stylesheet_id = ${input.stylesheetId}), 0)
        )
        returning id`;
      return { id: row.id };
    } catch (e) {
      if (e instanceof Error && 'code' in e && (e as { code: string }).code === '23505') continue;
      throw e;
    }
  }
  throw new CodedError('no_free_class_name', 'Could not find a free class name for that label. Try a different one.');
}

export async function updateCustomStyle(input: { id: string; label: string; kind: string; css: string }): Promise<void> {
  const label = requireName(input.label, MAX_LABEL, 'label');
  const kind = validateKind(input.kind);
  const [existing] = await db<{ slug: string }[]>`select slug from custom_styles where id = ${input.id}`;
  if (!existing) throw new CodedError('not_found', 'That style no longer exists.');
  validateStyleCss(input.css, existing.slug);
  await db`
    update custom_styles
    set label = ${label}, kind = ${kind}, css = ${input.css}, updated_at = now()
    where id = ${input.id}`;
}

export async function deleteCustomStyle(id: string): Promise<void> {
  await db`delete from custom_styles where id = ${id}`;
}

export async function moveCustomStyle(id: string, direction: 'up' | 'down'): Promise<void> {
  await db.begin(async (tx) => {
    const [own] = await tx<{ stylesheet_id: string }[]>`select stylesheet_id from custom_styles where id = ${id}`;
    if (!own) return;
    const rows = await tx<{ id: string }[]>`
      select id from custom_styles where stylesheet_id = ${own.stylesheet_id} order by position, label for update`;
    const index = rows.findIndex((row) => row.id === id);
    const target = direction === 'up' ? index - 1 : index + 1;
    if (index === -1 || target < 0 || target >= rows.length) return;
    [rows[index], rows[target]] = [rows[target], rows[index]];
    for (const [position, row] of rows.entries()) {
      await tx`update custom_styles set position = ${position}, updated_at = now() where id = ${row.id}`;
    }
  });
}

export interface CompiledStyles {
  css: string;
  /** Content hash, the cache-busting segment of the artifact's URL. */
  hash: string;
}

/** One version's artifact and the styles as content names them, from one load. */
interface ScopeArtifact {
  compiled: CompiledStyles | null;
  refs: readonly CustomStyleRef[];
}

const artifactCache = new Map<string, ScopeArtifact>();

/** Count and newest timestamp of both tables, so a save, a toggle and a delete each change the key. */
async function artifactVersion(): Promise<string> {
  const [row] = await db<{ sheets: string; sheets_at: Date | null; styles: string; styles_at: Date | null }[]>`
    select
      (select count(*) from stylesheets where scope_kind = 'site') as sheets,
      (select max(updated_at) from stylesheets where scope_kind = 'site') as sheets_at,
      (select count(*) from custom_styles cs join stylesheets s on s.id = cs.stylesheet_id where s.scope_kind = 'site') as styles,
      (select max(cs.updated_at) from custom_styles cs join stylesheets s on s.id = cs.stylesheet_id where s.scope_kind = 'site') as styles_at`;
  return `${row.sheets}:${row.sheets_at?.toISOString() ?? '-'}:${row.styles}:${row.styles_at?.toISOString() ?? '-'}`;
}

/** The site's compiled stylesheet, or null when it would be empty. */
export async function getCompiledStyles(): Promise<CompiledStyles | null> {
  return (await getScopeArtifact()).compiled;
}

/**
 * Every named style of the scope. The class is built here, beside the compiler
 * that writes its selector, so the two cannot drift. Disabled sheets are
 * included so the content they styled still resolves; the picker filters on `enabled`.
 */
export async function listCustomStyleRefs(): Promise<readonly CustomStyleRef[]> {
  return (await getScopeArtifact()).refs;
}

async function getScopeArtifact(): Promise<ScopeArtifact> {
  const version = await artifactVersion();
  const cached = artifactCache.get(version);
  if (cached) return cached;

  const sheets = await listStylesheets();
  const input: CompileSheet[] = sheets.map((sheet) => ({
    id: sheet.id,
    position: sheet.position,
    enabled: sheet.enabled,
    freeCss: sheet.freeCss,
    styles: sheet.styles.map((style) => ({ id: style.id, slug: style.slug, kind: style.kind, css: style.css, position: style.position })),
  }));
  const { css: compiledCss } = compileStylesheets(input);
  // The custom layer sits above the theme and component CSS whatever the
  // selectors weigh, below the per-page overrides (platform/cssLayers.ts).
  const css = compiledCss ? LAYER_ORDER + inLayer('custom', compiledCss) : '';
  const compiled = css ? { css, hash: createHash('sha256').update(css).digest('hex').slice(0, 16) } : null;
  const refs: CustomStyleRef[] = sheets.flatMap((sheet) =>
    sheet.styles.map((style) => ({
      id: style.id,
      className: styleClass(style.slug),
      label: style.label,
      kind: style.kind,
      stylesheet: sheet.name,
      enabled: sheet.enabled,
    }))
  );

  const artifact: ScopeArtifact = { compiled, refs };
  // Old versions are never asked for again once a newer one is served.
  if (artifactCache.size > 8) artifactCache.clear();
  artifactCache.set(version, artifact);
  return artifact;
}

/**
 * The root layout's link to the artifact, or null without custom styles. One
 * link on every surface it wraps keeps the editor and the reader alike.
 */
export async function customStylesHref(): Promise<string | null> {
  const compiled = await getCompiledStyles();
  return compiled ? `/api/styles/site/${compiled.hash}` : null;
}
