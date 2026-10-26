// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter for /settings/styles/[id], re-exported by src/routes/settings/styles/[id]/+page.server.ts.
// A CSS failure is a field error: its issues go back as `cssIssues`, not one `error` banner.
import { error } from '@sveltejs/kit';
import { requireAction, settingsAudit } from '$lib/features/auth/routes/requireAction.server';
import {
  CustomCssError,
  createCustomStyle,
  deleteCustomStyle,
  getStylesheet,
  moveCustomStyle,
  saveFreeCss,
  updateCustomStyle,
} from '../customStyles.server';
import type { Actions, ServerLoadEvent } from '@sveltejs/kit';
import { formError } from '$lib/platform/formError.server';

const ACTION = 'stylesheet:manage';

// Every failure carries `cssIssues`, empty when the CSS was not the problem, so the page sees one shape.
function failed(e: unknown) {
  const issues = e instanceof CustomCssError ? e.issues : [];
  return formError(e, {}, { cssIssues: issues });
}

// docs/architecture/logging.md, "The audit subset".
const audit = settingsAudit('stylesheet', 'stylesheet:manage');

export const load = async ({ locals, params }: ServerLoadEvent<{ id: string }>) => {
  requireAction(locals.user, ACTION, locals.log);
  const sheet = await getStylesheet(params.id);
  if (!sheet) throw error(404, 'Not found');
  return { sheet };
};

export const actions = {
  saveFreeCss: async ({ request, locals, params }) => {
    requireAction(locals.user, ACTION, locals.log);
    const form = await request.formData();
    try {
      await saveFreeCss(params.id!, String(form.get('css') ?? ''));
    } catch (e) {
      return failed(e);
    }
    audit(locals, 'saveFreeCss');
    return { ok: true };
  },

  createStyle: async ({ request, locals, params }) => {
    requireAction(locals.user, ACTION, locals.log);
    const form = await request.formData();
    try {
      await createCustomStyle({
        stylesheetId: params.id!,
        label: String(form.get('label') ?? ''),
        kind: String(form.get('kind') ?? 'inline'),
        css: String(form.get('css') ?? ''),
      });
    } catch (e) {
      return failed(e);
    }
    audit(locals, 'createStyle');
    return { ok: true };
  },

  updateStyle: async ({ request, locals }) => {
    requireAction(locals.user, ACTION, locals.log);
    const form = await request.formData();
    try {
      await updateCustomStyle({
        id: String(form.get('id') ?? ''),
        label: String(form.get('label') ?? ''),
        kind: String(form.get('kind') ?? 'inline'),
        css: String(form.get('css') ?? ''),
      });
    } catch (e) {
      return failed(e);
    }
    audit(locals, 'updateStyle');
    return { ok: true };
  },

  moveStyle: async ({ request, locals }) => {
    requireAction(locals.user, ACTION, locals.log);
    const form = await request.formData();
    const direction = form.get('direction') === 'up' ? 'up' : 'down';
    await moveCustomStyle(String(form.get('id') ?? ''), direction);
    audit(locals, 'moveStyle');
    return { ok: true };
  },

  deleteStyle: async ({ request, locals }) => {
    requireAction(locals.user, ACTION, locals.log);
    const form = await request.formData();
    await deleteCustomStyle(String(form.get('id') ?? ''));
    audit(locals, 'deleteStyle');
    return { ok: true };
  },
} satisfies Actions;
