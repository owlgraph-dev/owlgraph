// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The site's page layout presets (docs/architecture/blocks/layout.md, "Page layout: sections"). A page
// renders from its own copy (content/page/pageColumns.ts), never from a preset.
// The page records the name as a plain string, matched against every translation.
import { localize, type LocalizedText } from '$lib/platform/i18n/localizedText';
import { CodedError } from '$lib/platform/codedError';
import {
  TIERS,
  CUSTOM_PRESET_ID,
  MAX_PRESET_LABEL,
  STANDARD_PRESET_ID,
  normalizeGap,
  normalizeSectionDefaults,
  sameRatios,
  strictTemplate,
  type ColumnGap,
  type ColumnTemplate,
  type PageColumns,
  type SectionDefaults,
} from '$lib/features/content';

export interface PageLayoutPreset {
  /** Stable, fixed at creation: what a page records as its provenance. */
  id: string;
  /** Never empty: the site default language at least. */
  label: LocalizedText;
  /** Optional as a whole: `{}` is none. */
  description: LocalizedText;
  mode: 'flow' | 'columns';
  /** A flow has none. */
  template: ColumnTemplate | null;
  /** Only the tiers that deviate from the grid's own gap (M). */
  gap: ColumnGap;
  sectionDefaults: SectionDefaults;
  enabled: boolean;
  /** Standard, the flow every page falls back to: never deleted, disabled or given columns. */
  protected: boolean;
}

const seed = (id: string, label: LocalizedText, description: LocalizedText, template: ColumnTemplate | null, sectionDefaults: SectionDefaults = {}): PageLayoutPreset => ({
  id,
  label,
  description,
  mode: template ? 'columns' : 'flow',
  template,
  gap: {},
  sectionDefaults,
  enabled: true,
  protected: id === STANDARD_PRESET_ID,
});

/**
 * The baseline's seed rows of page_layout_presets; keep the two in step. This
 * copy reseeds an emptied e2e database.
 */
export const SEED_PAGE_LAYOUT_PRESETS: readonly PageLayoutPreset[] = [
  seed(STANDARD_PRESET_ID, { en: 'Standard', de: 'Standard' }, { en: 'Blocks one after another in the reading column.', de: 'Blöcke untereinander in der Lesebreite.' }, null),
  seed(
    'two-columns',
    { en: 'Two columns', de: 'Zwei Spalten' },
    { en: 'Two columns of equal width, stacked on a phone.', de: 'Zwei gleich breite Spalten, auf dem Telefon untereinander.' },
    { desktop: [1, 1], tablet: [1, 1], phone: [1] },
    { width: 'wide' }
  ),
  seed(
    'main-aside',
    { en: 'Main and side column', de: 'Haupt- und Nebenspalte' },
    {
      en: 'A main column and a narrower side column. On a phone the side column follows its content.',
      de: 'Eine Hauptspalte und eine schmalere Nebenspalte. Auf dem Telefon folgt die Nebenspalte ihrem Inhalt.',
    },
    { desktop: [2, 1], tablet: [2, 1], phone: [1] },
    { width: 'wide' }
  ),
  seed(
    'three-columns',
    { en: 'Three columns', de: 'Drei Spalten' },
    { en: 'Three columns, two on a tablet, one on a phone.', de: 'Drei Spalten, zwei auf dem Tablet, eine auf dem Telefon.' },
    { desktop: [1, 1, 1], tablet: [1, 1], phone: [1] },
    { width: 'wide' }
  ),
  seed(
    'sections',
    { en: 'Sections', de: 'Abschnitte' },
    { en: 'Single-column bands across the full width.', de: 'Einspaltige Bänder über die volle Breite.' },
    { desktop: [1], tablet: [1], phone: [1] },
    { width: 'full' }
  ),
];

/** In the viewer's language; the id when it has no name. */
export function presetName(preset: Pick<PageLayoutPreset, 'id' | 'label'>): string {
  return localize(preset.label, preset.id);
}

const MAX_PRESET_DESCRIPTION = 200;

const TRANSLITERATE: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };

/** Fixed at creation, so a rename never loses a page's provenance. */
export function presetIdFromLabel(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => TRANSLITERATE[c] ?? c)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  // Never a name that means something else here.
  return !slug || slug === CUSTOM_PRESET_ID ? 'layout' : slug;
}

/** The page's copy of a columns preset, its id and name as provenance; null for a flow. */
export function presetSnapshot(preset: PageLayoutPreset): PageColumns | null {
  if (preset.mode !== 'columns' || !preset.template) return null;
  const gap = normalizeGap(preset.gap);
  const sectionDefaults = normalizeSectionDefaults(preset.sectionDefaults);
  return {
    mode: 'columns',
    template: { desktop: [...preset.template.desktop], tablet: [...preset.template.tablet], phone: [...preset.template.phone] },
    ...(Object.keys(gap).length ? { gap } : {}),
    preset: preset.id,
    presetLabel: presetName(preset),
    ...(Object.keys(sectionDefaults).length ? { sectionDefaults } : {}),
  };
}

function sameLayout(a: PageColumns, b: PageColumns): boolean {
  const ga = normalizeGap(a.gap);
  const gb = normalizeGap(b.gap);
  const sa = normalizeSectionDefaults(a.sectionDefaults);
  const sb = normalizeSectionDefaults(b.sectionDefaults);
  return (
    TIERS.every((tier) => sameRatios(a.template[tier], b.template[tier]) && ga[tier] === gb[tier]) &&
    sa.width === sb.width &&
    !!sa.bleedToTop === !!sb.bleedToTop
  );
}

export interface PresetResolution {
  /** The preset the page's layout came from, or null: Custom. */
  preset: PageLayoutPreset | null;
  /** The page's values have drifted from the preset's ("customized"). */
  customized: boolean;
}

/** `name` is lower-cased; matches any language. */
function goesBy(preset: PageLayoutPreset, name: string): boolean {
  return Object.values(preset.label).some((text) => text?.toLowerCase() === name);
}

/**
 * A columns page matches the enabled preset by recorded id, else by recorded
 * name in any language (a page from another site), else none: Custom.
 */
export function resolvePageLayoutPreset(columns: PageColumns | null, presets: readonly PageLayoutPreset[]): PresetResolution {
  const enabled = presets.filter((p) => p.enabled);
  if (!columns) return { preset: enabled.find((p) => p.mode === 'flow' && p.protected) ?? null, customized: false };
  if (columns.preset === CUSTOM_PRESET_ID) return { preset: null, customized: false };
  const candidates = enabled.filter((p) => p.mode === 'columns');
  const label = columns.presetLabel?.toLowerCase();
  const preset = candidates.find((p) => p.id === columns.preset) ?? (label ? candidates.find((p) => goesBy(p, label)) : undefined) ?? null;
  if (!preset) return { preset: null, customized: false };
  const snapshot = presetSnapshot(preset);
  return { preset, customized: !snapshot || !sameLayout(columns, snapshot) };
}

export interface PresetFields {
  label: LocalizedText;
  description: LocalizedText;
  template: ColumnTemplate | null;
  gap: ColumnGap;
  sectionDefaults: SectionDefaults;
}

/** Trimmed, blanks dropped; the server validates the languages (parseLocalizedText). */
function texts(raw: unknown): LocalizedText {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [locale, value] of Object.entries(raw)) {
    const text = typeof value === 'string' ? value.trim() : '';
    if (text) out[locale] = text;
  }
  return out as LocalizedText;
}

const longest = (text: LocalizedText) => Math.max(0, ...Object.values(text).map((t) => t?.length ?? 0));

/** The fields as given, or the refusal that says why they can't be stored. */
export function presetFieldsOrError(
  raw: { label?: unknown; description?: unknown; template?: unknown; gap?: unknown; sectionDefaults?: unknown },
  mode: 'flow' | 'columns'
): PresetFields | CodedError {
  const label = texts(raw.label);
  if (Object.keys(label).length === 0) return new CodedError('name_required', 'Enter a name.');
  if (longest(label) > MAX_PRESET_LABEL) return new CodedError('too_long', `A name may be at most ${MAX_PRESET_LABEL} characters.`, { max: MAX_PRESET_LABEL });
  const description = texts(raw.description);
  if (longest(description) > MAX_PRESET_DESCRIPTION) return new CodedError('too_long', `A description may be at most ${MAX_PRESET_DESCRIPTION} characters.`, { max: MAX_PRESET_DESCRIPTION });
  if (mode === 'flow') return { label, description, template: null, gap: {}, sectionDefaults: {} };
  const template = strictTemplate(raw.template);
  if (!template) return new CodedError('invalid_columns', 'Each screen size needs 1 to 4 columns with ratios from 1 to 12, and a smaller one never more columns than a larger one.');
  const gap = normalizeGap(raw.gap);
  const given = raw.gap && typeof raw.gap === 'object' ? Object.values(raw.gap as object).filter((v) => v != null && v !== '').length : 0;
  if (given !== Object.keys(gap).length) return new CodedError('invalid_gap', 'A gap is one of none, sm, md or lg.');
  return { label, description, template, gap, sectionDefaults: normalizeSectionDefaults(raw.sectionDefaults) };
}
