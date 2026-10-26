// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { presetFieldsOrError, presetIdFromLabel, presetSnapshot, resolvePageLayoutPreset, SEED_PAGE_LAYOUT_PRESETS, type PageLayoutPreset } from './pageLayoutPresets';

const seeded = (id: string) => SEED_PAGE_LAYOUT_PRESETS.find((p) => p.id === id)!;
// As a page holds it once applied, chosen in English.
const MAIN_ASIDE = presetSnapshot(seeded('main-aside'))!;

describe('page layout presets', () => {
  const preset = (over: Partial<PageLayoutPreset>): PageLayoutPreset => ({ ...seeded('two-columns'), ...over });

  it('are copied into the page: template, gap and section defaults, with their id and name as provenance', () => {
    expect(presetSnapshot(seeded('three-columns'))).toEqual({
      mode: 'columns',
      template: { desktop: [1, 1, 1], tablet: [1, 1], phone: [1] },
      preset: 'three-columns',
      presetLabel: 'Three columns',
      sectionDefaults: { width: 'wide' },
    });
    expect(presetSnapshot(seeded('standard'))).toBeNull();
    expect(presetSnapshot(preset({ sectionDefaults: { bleedToTop: true } }))?.sectionDefaults).toEqual({ bleedToTop: true });
  });

  it('resolve a page to its preset by id, else by name in any language, else as Custom — and say when it has drifted', () => {
    const presets = [...SEED_PAGE_LAYOUT_PRESETS];
    expect(resolvePageLayoutPreset(null, presets).preset?.id).toBe('standard');
    expect(resolvePageLayoutPreset(MAIN_ASIDE, presets)).toMatchObject({ preset: { id: 'main-aside' }, customized: false });
    // Edited on the page.
    expect(resolvePageLayoutPreset({ ...MAIN_ASIDE, template: { desktop: [3, 1], tablet: [2, 1], phone: [1] } }, presets)).toMatchObject({ preset: { id: 'main-aside' }, customized: true });
    // Edited in the settings: the page didn't follow.
    const edited = presets.map((p) => (p.id === 'main-aside' ? { ...p, template: { desktop: [1, 1, 1], tablet: [1, 1], phone: [1] } } : p));
    expect(resolvePageLayoutPreset(MAIN_ASIDE, edited).customized).toBe(true);
    // A page from another site: an unknown id, a known name in either language.
    expect(resolvePageLayoutPreset({ ...MAIN_ASIDE, preset: 'elsewhere' }, presets).preset?.id).toBe('main-aside');
    expect(resolvePageLayoutPreset({ ...MAIN_ASIDE, preset: 'elsewhere', presetLabel: 'Haupt- und Nebenspalte' }, presets).preset?.id).toBe('main-aside');
    expect(resolvePageLayoutPreset({ ...MAIN_ASIDE, preset: 'elsewhere', presetLabel: 'Gone' }, presets).preset).toBeNull();
    const disabled = presets.map((p) => (p.id === 'main-aside' ? { ...p, enabled: false } : p));
    expect(resolvePageLayoutPreset(MAIN_ASIDE, disabled).preset).toBeNull();
    expect(resolvePageLayoutPreset({ ...MAIN_ASIDE, preset: 'custom' }, presets).preset).toBeNull();
  });

  it('take their fields exactly as given, refusing rather than repairing', () => {
    expect(presetFieldsOrError({ label: { en: ' Two ', de: '' }, template: { desktop: [1, 1], tablet: [1, 1], phone: [1] }, gap: { phone: 'lg' }, sectionDefaults: { width: 'wide', x: 1 } }, 'columns')).toEqual({
      label: { en: 'Two' },
      description: {},
      template: { desktop: [1, 1], tablet: [1, 1], phone: [1] },
      gap: { phone: 'lg' },
      sectionDefaults: { width: 'wide' },
    });
    expect(presetFieldsOrError({ label: {}, template: {} }, 'columns')).toMatchObject({ code: 'name_required' });
    expect(presetFieldsOrError({ label: { en: 'x'.repeat(65) }, template: {} }, 'columns')).toMatchObject({ code: 'too_long', details: { max: 64 } });
    expect(presetFieldsOrError({ label: { en: 'x' }, template: { desktop: [1, 1], tablet: [1, 1], phone: [1] }, gap: { desktop: 'huge' } }, 'columns')).toMatchObject({ code: 'invalid_gap' });
    expect(presetFieldsOrError({ label: { en: 'Standard' }, template: { desktop: [1, 1] } }, 'flow')).toMatchObject({ template: null, gap: {}, sectionDefaults: {} });
  });

  it('take their id from their first label', () => {
    expect(presetIdFromLabel('Haupt- und Nebenspalte')).toBe('haupt-und-nebenspalte');
    expect(presetIdFromLabel('Größe & Maß')).toBe('groesse-mass');
    expect(presetIdFromLabel('!!!')).toBe('layout');
    expect(presetIdFromLabel('Custom')).toBe('layout');
  });
});
