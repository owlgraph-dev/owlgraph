// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter for /settings/api-tokens, re-exported by src/routes/settings/api-tokens/+page.server.ts.
import { listApiTokens, createApiToken, revokeApiToken } from '$lib/features/auth/server';
import * as m from '$lib/paraglide/messages';
import type { Actions, ServerLoadEvent } from '@sveltejs/kit';
import { formError } from '$lib/platform/formError.server';

export const load = async ({ locals }: ServerLoadEvent) => {
  return { tokens: await listApiTokens(locals.user!.id), role: locals.user!.role };
};

export const actions = {
  create: async ({ request, locals }) => {
    const f = await request.formData();
    const name = String(f.get('name') ?? '').trim() || m.settings_api_tokens_untitled();
    const { token, prefix } = await createApiToken(locals.user!.id, name);
    // The only time the raw token leaves the server.
    return { created: { token, prefix, name } };
  },
  revoke: async ({ request, locals }) => {
    const f = await request.formData();
    const id = String(f.get('id') ?? '');
    if (!id) return formError('invalid_request', { field: 'id' });
    await revokeApiToken(id, locals.user!.id);
    return { ok: true };
  },
} satisfies Actions;
