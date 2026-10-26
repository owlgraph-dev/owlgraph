// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter for /settings/fonts, re-exported by src/routes/settings/fonts/+page.server.ts.
import { requireAction, settingsAudit } from '$lib/features/auth/routes/requireAction.server';
import { listFontFamilies, createFontFamily, addFontVariant, removeFontVariant, removeFontFamily } from '$lib/features/content/server';
import type { Actions, ServerLoadEvent } from '@sveltejs/kit';
import { formError } from '$lib/platform/formError.server';

// docs/architecture/logging.md, "The audit subset".
const audit = settingsAudit('fonts', 'font:manage');

export const load = async ({ locals }: ServerLoadEvent) => {
  requireAction(locals.user, 'font:manage', locals.log);
  const families = await listFontFamilies();
  return {
    families: families.map((f) => ({
      id: f.id,
      name: f.name,
      variants: f.variants.map((v) => ({ id: v.id, weight: v.weight, style: v.style, url: `/api/media/fonts/${v.assetId}` })),
    })),
  };
};

export const actions = {
  createFamily: async ({ request, locals }) => {
    requireAction(locals.user, 'font:manage', locals.log);
    const f = await request.formData();
    const name = String(f.get('name') ?? '').trim();
    if (!name) return formError('family_name_required');
    try {
      await createFontFamily(name, locals.user!.id);
    } catch (e) {
      return formError(e);
    }
    audit(locals, 'createFamily');
    return { ok: true };
  },

  addVariant: async ({ request, locals }) => {
    requireAction(locals.user, 'font:manage', locals.log);
    const f = await request.formData();
    const familyId = String(f.get('familyId') ?? '');
    const weight = Number(f.get('weight'));
    const style = String(f.get('style') ?? '');
    const file = f.get('file');
    if (!familyId) return formError('invalid_request', { field: 'familyId' });
    if (!(file instanceof File) || file.size === 0) return formError('font_file_required');
    const bytes = Buffer.from(await file.arrayBuffer());
    try {
      await addFontVariant({ familyId, bytes, weight, style, createdBy: locals.user!.id });
    } catch (e) {
      return formError(e);
    }
    audit(locals, 'addVariant');
    return { ok: true };
  },

  removeVariant: async ({ request, locals }) => {
    requireAction(locals.user, 'font:manage', locals.log);
    const f = await request.formData();
    const variantId = String(f.get('variantId') ?? '');
    if (variantId) await removeFontVariant(variantId);
    audit(locals, 'removeVariant');
    return { ok: true };
  },

  removeFamily: async ({ request, locals }) => {
    requireAction(locals.user, 'font:manage', locals.log);
    const f = await request.formData();
    const familyId = String(f.get('familyId') ?? '');
    if (familyId) await removeFontFamily(familyId);
    audit(locals, 'removeFamily');
    return { ok: true };
  },
} satisfies Actions;
