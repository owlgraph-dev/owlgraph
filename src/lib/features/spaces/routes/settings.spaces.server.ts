// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter, re-exported by src/routes/settings/spaces/+page.server.ts.
import { requireAction } from '#lib/features/auth/routes/requireAction.server.ts';
import { logEvent } from '#lib/platform/logger.server.ts';
import {
  listSpaces,
  getSpace,
  createSpace,
  renameSpace,
  setSpaceAccessLevel,
  deleteSpace,
  getSpaceMembers,
  setSpaceMembers,
} from '#lib/features/spaces/server.ts';
import { listUsers } from '#lib/features/auth/server.ts';
import { db } from '#lib/platform/db.server.ts';
import type { Visibility } from '#lib/features/nodes/index.ts';
import type { Actions, ServerLoadEvent } from '@sveltejs/kit';
import { formError } from '#lib/platform/formError.server.ts';

const ACCESS_LEVELS = new Set(['public', 'internal', 'restricted']);

export const load = async ({ locals }: ServerLoadEvent) => {
  requireAction(locals.user, 'space:manage', locals.log);
  const spaces = await listSpaces();
  // Loaded up front, so opening the members dialog needs no round trip.
  const membersBySpace: Record<string, string[]> = {};
  for (const ns of spaces) {
    if (ns.access_level === 'restricted') membersBySpace[ns.id] = await getSpaceMembers(ns.id);
  }
  return {
    spaces,
    membersBySpace,
    users: (await listUsers()).map((u) => ({ id: u.id, name: u.name, email: u.email })),
  };
};

export const actions = {
  create: async ({ request, locals }) => {
    requireAction(locals.user, 'space:manage', locals.log);
    const f = await request.formData();
    const name = String(f.get('name') ?? '');
    const slug = String(f.get('slug') ?? '');
    const accessLevel = String(f.get('accessLevel') ?? 'internal');
    if (!ACCESS_LEVELS.has(accessLevel)) return formError('invalid_access_level');
    try {
      await createSpace({ name, slug, accessLevel: accessLevel as Visibility });
    } catch (e) {
      return formError(e);
    }
    return { ok: true };
  },

  // The edit modal posts one form. The default space posts no slug, which
  // renameSpace leaves as it is.
  update: async ({ request, locals }) => {
    requireAction(locals.user, 'space:manage', locals.log);
    const f = await request.formData();
    const id = String(f.get('id') ?? '');
    const name = String(f.get('name') ?? '');
    const slug = f.has('slug') ? String(f.get('slug') ?? '') : undefined;
    const accessLevel = String(f.get('accessLevel') ?? '');
    if (!ACCESS_LEVELS.has(accessLevel)) return formError('invalid_access_level');
    try {
      await renameSpace(id, { name, slug });
    } catch (e) {
      return formError(e);
    }
    // Read first, so the audit line carries from/to (docs/architecture/logging.md).
    const before = await getSpace(db, id);
    await setSpaceAccessLevel(id, accessLevel as Visibility);
    if (before?.access_level !== accessLevel) {
      logEvent(locals.log, 'space.access_changed', {
        spaceId: id,
        from: (before?.access_level as Visibility | undefined) ?? null,
        to: accessLevel as Visibility,
        actorId: locals.user?.id ?? null,
      });
    }
    return { ok: true };
  },

  delete: async ({ request, locals }) => {
    requireAction(locals.user, 'space:manage', locals.log);
    const f = await request.formData();
    const id = String(f.get('id') ?? '');
    try {
      await deleteSpace(id);
    } catch (e) {
      return formError(e);
    }
    return { ok: true };
  },

  setMembers: async ({ request, locals }) => {
    requireAction(locals.user, 'space:manage', locals.log);
    const f = await request.formData();
    const id = String(f.get('id') ?? '');
    const members = f.getAll('members').map(String);
    const before = await getSpaceMembers(id);
    const saved = await setSpaceMembers(id, members);
    logEvent(locals.log, 'space.membership_changed', {
      spaceId: id,
      addedIds: saved.filter((uid) => !before.includes(uid)),
      removedIds: before.filter((uid) => !saved.includes(uid)),
      actorId: locals.user?.id ?? null,
    });
    return { ok: true, members: saved };
  },
} satisfies Actions;
