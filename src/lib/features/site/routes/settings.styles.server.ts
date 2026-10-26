// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter for /settings/styles, re-exported by src/routes/settings/styles/+page.server.ts.
import { requireAction, settingsAudit } from '$lib/features/auth/routes/requireAction.server';
import { createStylesheet, deleteStylesheet, listStylesheets, moveStylesheet, renameStylesheet, setStylesheetEnabled } from '../customStyles.server';
import type { Actions, ServerLoadEvent } from '@sveltejs/kit';
import { formError } from '$lib/platform/formError.server';

const ACTION = 'stylesheet:manage';

// docs/architecture/logging.md, "The audit subset".
const audit = settingsAudit('styles', 'stylesheet:manage');

export const load = async ({ locals }: ServerLoadEvent) => {
  requireAction(locals.user, ACTION, locals.log);
  const sheets = await listStylesheets();
  return {
    sheets: sheets.map((sheet) => ({
      id: sheet.id,
      name: sheet.name,
      enabled: sheet.enabled,
      styleCount: sheet.styles.length,
    })),
  };
};

export const actions = {
  createSheet: async ({ request, locals }) => {
    requireAction(locals.user, ACTION, locals.log);
    const form = await request.formData();
    try {
      await createStylesheet(String(form.get('name') ?? ''));
    } catch (e) {
      return formError(e);
    }
    audit(locals, 'createSheet');
    return { ok: true };
  },

  renameSheet: async ({ request, locals }) => {
    requireAction(locals.user, ACTION, locals.log);
    const form = await request.formData();
    try {
      await renameStylesheet(String(form.get('id') ?? ''), String(form.get('name') ?? ''));
    } catch (e) {
      return formError(e);
    }
    audit(locals, 'renameSheet');
    return { ok: true };
  },

  toggleSheet: async ({ request, locals }) => {
    requireAction(locals.user, ACTION, locals.log);
    const form = await request.formData();
    await setStylesheetEnabled(String(form.get('id') ?? ''), form.get('enabled') === 'true');
    audit(locals, 'toggleSheet');
    return { ok: true };
  },

  moveSheet: async ({ request, locals }) => {
    requireAction(locals.user, ACTION, locals.log);
    const form = await request.formData();
    const direction = form.get('direction') === 'up' ? 'up' : 'down';
    await moveStylesheet(String(form.get('id') ?? ''), direction);
    audit(locals, 'moveSheet');
    return { ok: true };
  },

  deleteSheet: async ({ request, locals }) => {
    requireAction(locals.user, ACTION, locals.log);
    const form = await request.formData();
    await deleteStylesheet(String(form.get('id') ?? ''));
    audit(locals, 'deleteSheet');
    return { ok: true };
  },
} satisfies Actions;
