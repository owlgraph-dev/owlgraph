// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The site's page layout presets (docs/architecture/blocks/layout.md, "Page layout: sections"). A page copies
// a preset when applied, so editing, disabling or deleting one leaves pages as
// they are. Standard, the one flow, is refused deletion, disabling and columns
// here, so the settings UI is never the only guard.
import { db, type JsonArg, type TxSql } from '$lib/platform/db.server';
import { normalizeGap, normalizeSectionDefaults, normalizeTemplate } from '$lib/features/content';
import { localize, type LocalizedText } from '$lib/platform/i18n/localizedText';
import { parseLocalizedText } from '$lib/platform/i18n/localizedText.server';
import { siteDefaultLocale } from '$lib/platform/i18n/siteLocales';
import { presetFieldsOrError, presetIdFromLabel, SEED_PAGE_LAYOUT_PRESETS, type PageLayoutPreset } from './pageLayoutPresets';
import { CodedError } from '$lib/platform/codedError';

const json = (sql: TxSql, value: object) => sql.json(value as unknown as JsonArg);

interface Row {
  id: string;
  label: LocalizedText;
  description: LocalizedText;
  mode: 'flow' | 'columns';
  template: unknown;
  gap: unknown;
  section_defaults: unknown;
  enabled: boolean;
  protected: boolean;
}

function rowToPreset(row: Row): PageLayoutPreset {
  const template = row.mode === 'columns' ? normalizeTemplate(row.template) : null;
  return {
    id: row.id,
    label: row.label ?? {},
    description: row.description ?? {},
    // An invalid stored template can't be applied: the row reads as a flow.
    mode: template ? 'columns' : 'flow',
    template,
    gap: normalizeGap(row.gap),
    sectionDefaults: normalizeSectionDefaults(row.section_defaults),
    enabled: row.enabled,
    protected: row.protected,
  };
}

/** In the picker's order. */
export async function listPageLayoutPresets(sql: TxSql = db): Promise<PageLayoutPreset[]> {
  const rows = await sql<Row[]>`
    select id, label, description, mode, template, gap, section_defaults, enabled, protected
    from page_layout_presets
    where scope_kind = 'site'
    order by position, id`;
  return rows.map(rowToPreset);
}

export async function listEnabledPageLayoutPresets(): Promise<PageLayoutPreset[]> {
  return (await listPageLayoutPresets()).filter((p) => p.enabled);
}

/** For a test database the e2e setup emptied. */
export async function seedPageLayoutPresetsIfEmpty(sql: TxSql = db): Promise<void> {
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from page_layout_presets`;
  if (n > 0) return;
  for (const [position, p] of SEED_PAGE_LAYOUT_PRESETS.entries()) {
    await sql`
      insert into page_layout_presets (id, label, description, mode, template, gap, section_defaults, position, protected)
      values (${p.id}, ${json(sql, p.label)}, ${json(sql, p.description)}, ${p.mode}, ${p.template ? json(sql, p.template) : null}, ${json(sql, p.gap)}, ${json(sql, p.sectionDefaults)}, ${position}, ${p.protected})`;
  }
}

export interface PresetInput {
  label?: unknown;
  description?: unknown;
  template?: unknown;
  gap?: unknown;
  sectionDefaults?: unknown;
}

// Only the supported languages are taken.
function presetFields(input: PresetInput, mode: 'flow' | 'columns') {
  const fields = presetFieldsOrError({ ...input, label: parseLocalizedText(input.label), description: parseLocalizedText(input.description) }, mode);
  if (fields instanceof CodedError) throw fields;
  return fields;
}

// Unique per language. The pre-check is the only guard: a unique index can't
// read a JSONB object.
async function assertLabelFree(label: LocalizedText, except: string | null): Promise<void> {
  const [taken] = await db<{ name: string }[]>`
    select wanted.value as name
    from page_layout_presets o, jsonb_each_text(o.label) taken, jsonb_each_text(${json(db, label)}) wanted
    where o.scope_kind = 'site' and taken.key = wanted.key and lower(taken.value) = lower(wanted.value)
      and o.id is distinct from ${except}
    limit 1`;
  if (taken) throw new CodedError('layout_name_taken', `A page layout named "${taken.name}" already exists.`);
}

/** Its id comes from its name in the site default language and never changes. */
export async function createPageLayoutPreset(input: PresetInput): Promise<{ id: string }> {
  const fields = presetFields(input, 'columns');
  await assertLabelFree(fields.label, null);
  const base = presetIdFromLabel(localize(fields.label, '', siteDefaultLocale()));
  for (let n = 1; n < 100; n++) {
    const id = n === 1 ? base : `${base}-${n}`;
    const [row] = await db<{ id: string }[]>`
      insert into page_layout_presets (id, scope_kind, label, description, mode, template, gap, section_defaults, position)
      values (${id}, 'site', ${json(db, fields.label)}, ${json(db, fields.description)}, 'columns', ${json(db, fields.template!)}, ${json(db, fields.gap)}, ${json(db, fields.sectionDefaults)},
        coalesce((select max(position) + 1 from page_layout_presets where scope_kind = 'site'), 0))
      on conflict (id) do nothing
      returning id`;
    if (row) return { id: row.id };
  }
  throw new CodedError('no_free_id', 'Could not find a free id for this page layout.');
}

async function presetRow(id: string): Promise<Row> {
  const [row] = await db<Row[]>`
    select id, label, description, mode, template, gap, section_defaults, enabled, protected
    from page_layout_presets where id = ${id} and scope_kind = 'site'`;
  if (!row) throw new CodedError('not_found', 'This page layout no longer exists.');
  return row;
}

/** Its id and mode stay: Standard stays a flow. */
export async function updatePageLayoutPreset(id: string, input: PresetInput): Promise<void> {
  const row = await presetRow(id);
  const fields = presetFields(input, row.mode);
  await assertLabelFree(fields.label, id);
  await db`
    update page_layout_presets
    set label = ${json(db, fields.label)}, description = ${json(db, fields.description)},
        template = ${fields.template ? json(db, fields.template) : null}, gap = ${json(db, fields.gap)},
        section_defaults = ${json(db, fields.sectionDefaults)}, updated_at = now()
    where id = ${id} and scope_kind = 'site'`;
}

export async function setPageLayoutPresetEnabled(id: string, enabled: boolean): Promise<void> {
  const row = await presetRow(id);
  if (row.protected && !enabled) throw new CodedError('standard_always_available', 'Standard is always available: it is the layout every page can fall back to.');
  await db`update page_layout_presets set enabled = ${enabled}, updated_at = now() where id = ${id} and scope_kind = 'site'`;
}

export async function deletePageLayoutPreset(id: string): Promise<void> {
  const row = await presetRow(id);
  if (row.protected) throw new CodedError('standard_undeletable', 'Standard can’t be deleted: it is the layout every page can fall back to.');
  await db`delete from page_layout_presets where id = ${id} and scope_kind = 'site'`;
}

// Positions are rewritten from the resulting order, not nudged, so duplicates
// settle themselves.
export async function movePageLayoutPreset(id: string, direction: 'up' | 'down'): Promise<void> {
  await db.begin(async (tx) => {
    const rows = await tx<{ id: string }[]>`
      select id from page_layout_presets where scope_kind = 'site' order by position, id for update`;
    const index = rows.findIndex((row) => row.id === id);
    if (index === -1) return;
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= rows.length) return;
    [rows[index], rows[target]] = [rows[target], rows[index]];
    for (const [position, row] of rows.entries()) {
      await tx`update page_layout_presets set position = ${position}, updated_at = now() where id = ${row.id}`;
    }
  });
}
