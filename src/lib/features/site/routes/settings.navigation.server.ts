// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter for /settings/navigation, re-exported by src/routes/settings/navigation/+page.server.ts.
import { requireAction, settingsAudit } from '$lib/features/auth/routes/requireAction.server';
import {
  listTreeAdmin,
  buildAdminTree,
  createTreeNode,
  updateTreeNode,
  deleteTreeNode,
  moveTreeNode,
  indentTreeNode,
  outdentTreeNode,
} from '$lib/features/site/server';
import { readTreeCreateInput, readTreeUpdateInput } from './treeInput.server';
import type { Actions, ServerLoadEvent } from '@sveltejs/kit';
import { formError } from '$lib/platform/formError.server';

// docs/architecture/logging.md, "The audit subset".
const audit = settingsAudit('navigation', 'navigation:manage');

export const load = async ({ locals }: ServerLoadEvent) => {
  requireAction(locals.user, 'navigation:manage', locals.log);
  const rows = await listTreeAdmin('nav');
  return { nodes: buildAdminTree(rows) };
};

export const actions = {
  create: async ({ request, locals }) => {
    requireAction(locals.user, 'navigation:manage', locals.log);
    const f = await request.formData();
    try {
      await createTreeNode('nav', readTreeCreateInput(f));
    } catch (e) {
      return formError(e);
    }
    audit(locals, 'create');
    return { ok: true };
  },

  update: async ({ request, locals }) => {
    requireAction(locals.user, 'navigation:manage', locals.log);
    const f = await request.formData();
    const id = String(f.get('id') ?? '');
    try {
      await updateTreeNode(id, readTreeUpdateInput(f));
    } catch (e) {
      return formError(e);
    }
    audit(locals, 'update');
    return { ok: true };
  },

  delete: async ({ request, locals }) => {
    requireAction(locals.user, 'navigation:manage', locals.log);
    const f = await request.formData();
    await deleteTreeNode(String(f.get('id') ?? ''));
    audit(locals, 'delete');
    return { ok: true };
  },

  move: async ({ request, locals }) => {
    requireAction(locals.user, 'navigation:manage', locals.log);
    const f = await request.formData();
    const id = String(f.get('id') ?? '');
    const direction = String(f.get('direction') ?? '') === 'down' ? 'down' : 'up';
    try {
      await moveTreeNode(id, direction);
    } catch (e) {
      return formError(e);
    }
    audit(locals, 'move');
    return { ok: true };
  },

  indent: async ({ request, locals }) => {
    requireAction(locals.user, 'navigation:manage', locals.log);
    const f = await request.formData();
    try {
      await indentTreeNode(String(f.get('id') ?? ''));
    } catch (e) {
      return formError(e);
    }
    audit(locals, 'indent');
    return { ok: true };
  },

  outdent: async ({ request, locals }) => {
    requireAction(locals.user, 'navigation:manage', locals.log);
    const f = await request.formData();
    try {
      await outdentTreeNode(String(f.get('id') ?? ''));
    } catch (e) {
      return formError(e);
    }
    audit(locals, 'outdent');
    return { ok: true };
  },
} satisfies Actions;
