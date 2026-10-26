// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter for /settings/page-layouts, re-exported by src/routes/settings/page-layouts/+page.server.ts.
// The registry's rules live in pages/pageLayoutPresets.server.ts, so every refusal here is the model's.
import { requireAction, settingsAudit } from '$lib/features/auth/routes/requireAction.server';
import { createPageLayoutPreset, deletePageLayoutPreset, listPageLayoutPresets, movePageLayoutPreset, setPageLayoutPresetEnabled, updatePageLayoutPreset, type PresetInput } from '$lib/features/pages/server';
import { localizedTextFromForm } from '$lib/platform/i18n/localizedText.server';
import type { Actions, ServerLoadEvent } from '@sveltejs/kit';
import { formError } from '$lib/platform/formError.server';

const ACTION = 'page-layout:manage';

// A preset's fields are logged as a content hash only; a toggle's new state
// as `to` (docs/architecture/logging.md, "The audit subset").
const audit = settingsAudit('page-layouts', 'page-layout:manage');

export const load = async ({ locals }: ServerLoadEvent) => {
  requireAction(locals.user, ACTION, locals.log);
  return { presets: await listPageLayoutPresets() };
};

/** A structured field the modal posts as JSON (it holds its state until Save). */
function jsonField(form: FormData, name: string): unknown {
  const raw = form.get(name);
  if (typeof raw !== 'string' || raw === '') return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

// Throws a readable refusal.
function presetInput(form: FormData): PresetInput {
  return {
    label: localizedTextFromForm(form, 'label', { required: true, what: 'name' }),
    description: localizedTextFromForm(form, 'description', { required: false, what: 'description' }),
    template: jsonField(form, 'template'),
    gap: jsonField(form, 'gap'),
    sectionDefaults: jsonField(form, 'sectionDefaults'),
  };
}

export const actions = {
  createPreset: async ({ request, locals }) => {
    requireAction(locals.user, ACTION, locals.log);
    const form = await request.formData();
    let input: PresetInput;
    try {
      input = presetInput(form);
      await createPageLayoutPreset(input);
    } catch (e) {
      return formError(e);
    }
    audit(locals, 'createPreset', { payload: JSON.stringify(input) });
    return { ok: true };
  },

  updatePreset: async ({ request, locals }) => {
    requireAction(locals.user, ACTION, locals.log);
    const form = await request.formData();
    let input: PresetInput;
    try {
      input = presetInput(form);
      await updatePageLayoutPreset(String(form.get('id') ?? ''), input);
    } catch (e) {
      return formError(e);
    }
    audit(locals, 'updatePreset', { payload: JSON.stringify(input) });
    return { ok: true };
  },

  togglePreset: async ({ request, locals }) => {
    requireAction(locals.user, ACTION, locals.log);
    const form = await request.formData();
    const enabled = form.get('enabled') === 'true';
    try {
      await setPageLayoutPresetEnabled(String(form.get('id') ?? ''), enabled);
    } catch (e) {
      return formError(e);
    }
    audit(locals, 'togglePreset', { to: enabled });
    return { ok: true };
  },

  movePreset: async ({ request, locals }) => {
    requireAction(locals.user, ACTION, locals.log);
    const form = await request.formData();
    await movePageLayoutPreset(String(form.get('id') ?? ''), form.get('direction') === 'up' ? 'up' : 'down');
    audit(locals, 'movePreset');
    return { ok: true };
  },

  deletePreset: async ({ request, locals }) => {
    requireAction(locals.user, ACTION, locals.log);
    const form = await request.formData();
    try {
      await deletePageLayoutPreset(String(form.get('id') ?? ''));
    } catch (e) {
      return formError(e);
    }
    audit(locals, 'deletePreset');
    return { ok: true };
  },
} satisfies Actions;
