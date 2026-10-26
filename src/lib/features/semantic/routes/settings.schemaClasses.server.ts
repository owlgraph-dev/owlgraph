// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter for /settings/schema/classes, re-exported by src/routes/settings/schema/classes/+page.server.ts.
import { listNodeClasses, upsertNodeClass, deleteNodeClass } from '$lib/features/semantic/server';
import { listPropertyGroups } from '$lib/features/semantic/server';
import { requireAction, settingsAudit } from '$lib/features/auth/routes/requireAction.server';
import { localizedTextFromForm } from '$lib/platform/i18n/localizedText.server';
import type { Actions, ServerLoadEvent } from '@sveltejs/kit';
import { formError } from '$lib/platform/formError.server';

// docs/architecture/logging.md, "The audit subset".
const audit = settingsAudit('schema.classes', 'class:manage');

export const load = async ({ locals }: ServerLoadEvent) => {
  requireAction(locals.user, 'class:manage', locals.log);
  const [classes, groups] = await Promise.all([listNodeClasses(), listPropertyGroups()]);
  return { classes, groups };
};

export const actions = {
  save: async ({ request, locals }) => {
    requireAction(locals.user, 'class:manage', locals.log);
    const f = await request.formData();
    try {
      await upsertNodeClass({
        id: String(f.get('id') ?? '') || null,
        slug: String(f.get('slug') ?? ''),
        label: localizedTextFromForm(f, 'label', { required: true, what: 'label' }),
        description: localizedTextFromForm(f, 'description', { required: false, what: 'description' }),
        propertyGroup: String(f.get('propertyGroup') ?? ''),
        overviewNodeId: String(f.get('overviewNodeId') ?? ''),
        // Fixes which nodes the class can be assigned to. Required on create;
        // a core class ignores it.
        parentId: String(f.get('parentId') ?? ''),
      });
    } catch (e) {
      return formError(e);
    }
    audit(locals, 'save');
    return { saved: true };
  },
  delete: async ({ request, locals }) => {
    requireAction(locals.user, 'class:manage', locals.log);
    const f = await request.formData();
    try {
      await deleteNodeClass(String(f.get('id') ?? ''));
    } catch (e) {
      return formError(e);
    }
    audit(locals, 'delete');
    return { deleted: true };
  },
} satisfies Actions;
