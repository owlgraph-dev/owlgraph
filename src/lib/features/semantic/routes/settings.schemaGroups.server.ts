// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter for /settings/schema/groups, re-exported by src/routes/settings/schema/groups/+page.server.ts.
import { listPropertyGroups, upsertPropertyGroup, deletePropertyGroup } from '$lib/features/semantic/server';
import { requireAction, settingsAudit } from '$lib/features/auth/routes/requireAction.server';
import { localizedTextFromForm } from '$lib/platform/i18n/localizedText.server';
import type { Actions, ServerLoadEvent } from '@sveltejs/kit';
import { formError } from '$lib/platform/formError.server';

// docs/architecture/logging.md, "The audit subset".
const audit = settingsAudit('schema.groups', 'property-group:manage');

export const load = async ({ locals }: ServerLoadEvent) => {
  requireAction(locals.user, 'property-group:manage', locals.log);
  return { groups: await listPropertyGroups() };
};

export const actions = {
  save: async ({ request, locals }) => {
    requireAction(locals.user, 'property-group:manage', locals.log);
    const f = await request.formData();
    try {
      await upsertPropertyGroup({
        slug: String(f.get('slug') ?? ''),
        label: localizedTextFromForm(f, 'label', { required: true, what: 'label' }),
        description: localizedTextFromForm(f, 'description', { required: false, what: 'description' }),
      });
    } catch (e) {
      return formError(e);
    }
    audit(locals, 'save');
    return { saved: true };
  },
  delete: async ({ request, locals }) => {
    requireAction(locals.user, 'property-group:manage', locals.log);
    const f = await request.formData();
    try {
      await deletePropertyGroup(String(f.get('slug') ?? ''));
    } catch (e) {
      return formError(e);
    }
    audit(locals, 'delete');
    return { deleted: true };
  },
} satisfies Actions;
