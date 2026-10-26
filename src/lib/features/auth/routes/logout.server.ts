// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter for /logout, re-exported by src/routes/logout/+page.server.ts.
import { redirect } from '@sveltejs/kit';
import { deleteSession } from '$lib/features/auth/server';
import { logEvent } from '$lib/platform/logger.server';
import type { Actions } from '@sveltejs/kit';

export const actions = {
  default: async ({ cookies, locals }) => {
    const token = cookies.get('session');
    logEvent(locals.log, 'auth.logout', {});
    await deleteSession(token);
    cookies.delete('session', { path: '/' });
    throw redirect(303, '/login');
  },
} satisfies Actions;
