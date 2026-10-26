// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter, re-exported by src/routes/settings/namespaces/+page.server.ts.
import { requireAction } from '$lib/features/auth/routes/requireAction.server';
import { logEvent } from '$lib/platform/logger.server';
import {
  listNamespaces,
  getNamespace,
  createNamespace,
  renameNamespace,
  setNamespaceAccessLevel,
  deleteNamespace,
  getNamespaceMembers,
  setNamespaceMembers,
} from '$lib/features/namespaces/server';
import { listUsers } from '$lib/features/auth/server';
import { db } from '$lib/platform/db.server';
import type { Visibility } from '$lib/features/nodes';
import type { Actions, ServerLoadEvent } from '@sveltejs/kit';
import { formError } from '$lib/platform/formError.server';

const ACCESS_LEVELS = new Set(['public', 'internal', 'restricted']);

export const load = async ({ locals }: ServerLoadEvent) => {
  requireAction(locals.user, 'namespace:manage', locals.log);
  const namespaces = await listNamespaces();
  // Loaded up front, so opening the members dialog needs no round trip.
  const membersByNamespace: Record<string, string[]> = {};
  for (const ns of namespaces) {
    if (ns.access_level === 'restricted') membersByNamespace[ns.id] = await getNamespaceMembers(ns.id);
  }
  return {
    namespaces,
    membersByNamespace,
    users: (await listUsers()).map((u) => ({ id: u.id, name: u.name, email: u.email })),
  };
};

export const actions = {
  create: async ({ request, locals }) => {
    requireAction(locals.user, 'namespace:manage', locals.log);
    const f = await request.formData();
    const name = String(f.get('name') ?? '');
    const slug = String(f.get('slug') ?? '');
    const accessLevel = String(f.get('accessLevel') ?? 'internal');
    if (!ACCESS_LEVELS.has(accessLevel)) return formError('invalid_access_level');
    try {
      await createNamespace({ name, slug, accessLevel: accessLevel as Visibility });
    } catch (e) {
      return formError(e);
    }
    return { ok: true };
  },

  // The edit modal posts one form. The default namespace posts no slug, which
  // renameNamespace leaves as it is.
  update: async ({ request, locals }) => {
    requireAction(locals.user, 'namespace:manage', locals.log);
    const f = await request.formData();
    const id = String(f.get('id') ?? '');
    const name = String(f.get('name') ?? '');
    const slug = f.has('slug') ? String(f.get('slug') ?? '') : undefined;
    const accessLevel = String(f.get('accessLevel') ?? '');
    if (!ACCESS_LEVELS.has(accessLevel)) return formError('invalid_access_level');
    try {
      await renameNamespace(id, { name, slug });
    } catch (e) {
      return formError(e);
    }
    // Read first, so the audit line carries from/to (docs/architecture/logging.md).
    const before = await getNamespace(db, id);
    await setNamespaceAccessLevel(id, accessLevel as Visibility);
    if (before?.access_level !== accessLevel) {
      logEvent(locals.log, 'namespace.access_changed', {
        namespaceId: id,
        from: (before?.access_level as Visibility | undefined) ?? null,
        to: accessLevel as Visibility,
        actorId: locals.user?.id ?? null,
      });
    }
    return { ok: true };
  },

  delete: async ({ request, locals }) => {
    requireAction(locals.user, 'namespace:manage', locals.log);
    const f = await request.formData();
    const id = String(f.get('id') ?? '');
    try {
      await deleteNamespace(id);
    } catch (e) {
      return formError(e);
    }
    return { ok: true };
  },

  setMembers: async ({ request, locals }) => {
    requireAction(locals.user, 'namespace:manage', locals.log);
    const f = await request.formData();
    const id = String(f.get('id') ?? '');
    const members = f.getAll('members').map(String);
    const before = await getNamespaceMembers(id);
    const saved = await setNamespaceMembers(id, members);
    logEvent(locals.log, 'namespace.membership_changed', {
      namespaceId: id,
      addedIds: saved.filter((uid) => !before.includes(uid)),
      removedIds: before.filter((uid) => !saved.includes(uid)),
      actorId: locals.user?.id ?? null,
    });
    return { ok: true, members: saved };
  },
} satisfies Actions;
