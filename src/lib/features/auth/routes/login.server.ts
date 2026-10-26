// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter for /login, re-exported by src/routes/login/+page.server.ts.
import { redirect } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { login } from '$lib/features/auth/server';
import { logEvent, requestLogger } from '$lib/platform/logger.server';
import { safeRedirect } from '$lib/features/auth';
import type { Actions, ServerLoadEvent } from '@sveltejs/kit';
import { formError } from '$lib/platform/formError.server';

const dest = (url: URL) => safeRedirect(url.searchParams.get('redirect'), url.origin);

export const load = async ({ locals, url }: ServerLoadEvent) => {
  if (locals.user) throw redirect(303, dest(url));
  return {};
};

export const actions = {
  default: async ({ request, cookies, url, locals }) => {
    const f = await request.formData();
    const email = String(f.get('email') ?? '');
    const password = String(f.get('password') ?? '');
    if (!email || !password) return formError('credentials_required', {}, { email });

    const result = await login(email, password);
    if (!result.ok) {
      // Never the email, not even for no_such_user (docs/architecture/logging.md, "Never logged").
      logEvent(locals.log, 'auth.login_failed', { failureClass: result.failureClass });
      // One message for every failure class: which one it was is never told.
      return formError('invalid_credentials', {}, { email });
    }
    // locals.log still carries the 'anon' this request arrived with.
    logEvent(requestLogger(locals.reqId, '/login', result.userId), 'auth.login_ok', {});

    cookies.set('session', result.token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: !dev,
      expires: result.expires,
    });
    throw redirect(303, dest(url));
  },
} satisfies Actions;
