// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter for /settings/schema/relationships, re-exported by src/routes/settings/schema/relationships/+page.server.ts.
import {
  listRelationshipTypes,
  upsertRelationshipType,
  deleteRelationshipType,
  getAllRelationshipTypeProperties,
  setRelationshipTypeProperties,
} from '$lib/features/semantic/server';
import { listPropertyDefinitions } from '$lib/features/semantic/server';
import { requireAction, settingsAudit } from '$lib/features/auth/routes/requireAction.server';
import { localizedTextFromForm } from '$lib/platform/i18n/localizedText.server';
import type { Actions, ServerLoadEvent } from '@sveltejs/kit';
import { formError } from '$lib/platform/formError.server';

// docs/architecture/logging.md, "The audit subset".
const audit = settingsAudit('schema.relationships', 'relationship:manage');

export const load = async ({ locals }: ServerLoadEvent) => {
  requireAction(locals.user, 'relationship:manage', locals.log);
  const [relationshipTypes, propertyDefinitions, typePropertiesMap] = await Promise.all([
    listRelationshipTypes(),
    listPropertyDefinitions(),
    getAllRelationshipTypeProperties(),
  ]);
  return {
    relationshipTypes,
    propertyDefinitions,
    typeProperties: Object.fromEntries(typePropertiesMap),
  };
};

export const actions = {
  save: async ({ request, locals }) => {
    requireAction(locals.user, 'relationship:manage', locals.log);
    const f = await request.formData();
    try {
      await upsertRelationshipType({
        slug: String(f.get('slug') ?? ''),
        label: localizedTextFromForm(f, 'label', { required: true, what: 'label' }),
        description: localizedTextFromForm(f, 'description', { required: false, what: 'description' }),
        inverseLabel: localizedTextFromForm(f, 'inverseLabel', { required: false, what: 'inverse label' }),
      });
    } catch (e) {
      return formError(e);
    }
    audit(locals, 'save');
    return { saved: true };
  },
  delete: async ({ request, locals }) => {
    requireAction(locals.user, 'relationship:manage', locals.log);
    const f = await request.formData();
    try {
      await deleteRelationshipType(String(f.get('slug') ?? ''));
    } catch (e) {
      return formError(e);
    }
    audit(locals, 'delete');
    return { deleted: true };
  },
  setProperties: async ({ request, locals }) => {
    requireAction(locals.user, 'relationship:manage', locals.log);
    const f = await request.formData();
    const slug = String(f.get('slug') ?? '');
    const propertyNames = f.getAll('propertyNames').map((v) => String(v));
    try {
      await setRelationshipTypeProperties(slug, propertyNames);
    } catch (e) {
      return formError(e);
    }
    audit(locals, 'setProperties');
    return { propertiesSaved: true };
  },
} satisfies Actions;
