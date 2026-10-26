// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter for /settings/schema/properties, re-exported by src/routes/settings/schema/properties/+page.server.ts.
import { listPropertyDefinitions, upsertPropertyDefinition, deletePropertyDefinition, listPropertyGroups } from '$lib/features/semantic/server';
import { requireAction, settingsAudit } from '$lib/features/auth/routes/requireAction.server';
import { localizedTextFromForm } from '$lib/platform/i18n/localizedText.server';
import type { Actions, ServerLoadEvent } from '@sveltejs/kit';
import { formError } from '$lib/platform/formError.server';

// docs/architecture/logging.md, "The audit subset".
const audit = settingsAudit('schema.properties', 'property:manage');

export const load = async ({ locals }: ServerLoadEvent) => {
  requireAction(locals.user, 'property:manage', locals.log);
  return {
    definitions: await listPropertyDefinitions(),
    groups: await listPropertyGroups(),
  };
};

export const actions = {
  save: async ({ request, locals }) => {
    requireAction(locals.user, 'property:manage', locals.log);
    const f = await request.formData();
    try {
      await upsertPropertyDefinition({
        localName: String(f.get('localName') ?? ''),
        groupSlug: String(f.get('groupSlug') ?? ''),
        label: localizedTextFromForm(f, 'label', { required: true, what: 'label' }),
        datatype: String(f.get('datatype') ?? 'text'),
        description: localizedTextFromForm(f, 'description', { required: false, what: 'description' }),
      });
    } catch (e) {
      return formError(e);
    }
    audit(locals, 'save');
    return { saved: true };
  },
  delete: async ({ request, locals }) => {
    requireAction(locals.user, 'property:manage', locals.log);
    const f = await request.formData();
    await deletePropertyDefinition(String(f.get('name') ?? ''));
    audit(locals, 'delete');
    return { deleted: true };
  },
} satisfies Actions;
