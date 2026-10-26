// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter for /settings/profile, re-exported by src/routes/settings/profile/+page.server.ts.
import { setOwnName } from '$lib/features/auth/server';
import { replaceAvatar, removeAvatar } from '$lib/features/media/server';
import { avatarUrl } from '$lib/features/media';
import type { Actions, ServerLoadEvent } from '@sveltejs/kit';
import { formError } from '$lib/platform/formError.server';

export const load = async ({ locals, parent }: ServerLoadEvent) => {
  // The root layout has already resolved avatarVersion for this render.
  const { user } = await parent();
  return {
    name: locals.user!.name,
    email: locals.user!.email,
    avatarUrl: avatarUrl(locals.user!.id, user?.avatarVersion),
  };
};

export const actions = {
  updateName: async ({ request, locals }) => {
    const f = await request.formData();
    const name = String(f.get('name') ?? '');
    await setOwnName(locals.user!.id, name);
    return { ok: true };
  },

  uploadAvatar: async ({ request, locals }) => {
    const f = await request.formData();
    const file = f.get('file');
    if (!(file instanceof File) || file.size === 0) return formError('image_required');
    const bytes = Buffer.from(await file.arrayBuffer());
    try {
      await replaceAvatar({ bytes, mime: file.type, userId: locals.user!.id });
    } catch (e) {
      return formError(e);
    }
    return { ok: true };
  },

  removeAvatar: async ({ locals }) => {
    await removeAvatar(locals.user!.id);
    return { ok: true };
  },
} satisfies Actions;
