// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter for /api/locale, re-exported by src/routes/api/locale/+server.ts.
// The language picker's one write (docs/architecture/languages.md): the explicit-choice cookie,
// which nothing else writes, and a signed-in viewer's preference, so the choice
// follows them to every device. Public; only an enabled language is accepted.
import { json } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { setOwnLocale } from '$lib/features/auth/server';
import { UI_LOCALE_COOKIE } from '$lib/platform/i18n/negotiate';
import { currentSiteLocaleConfig } from '$lib/platform/i18n/siteLocales.server';
import type { RequestHandler } from '@sveltejs/kit';
import { apiError } from '$lib/platform/apiErrors';

const ONE_YEAR_S = 60 * 60 * 24 * 365;

export const POST: RequestHandler = async ({ request, cookies, locals }) => {
  const body = (await request.json().catch(() => null)) as { locale?: unknown } | null;
  const locale = body?.locale;
  const config = await currentSiteLocaleConfig();
  if (typeof locale !== 'string' || !(config.enabled as readonly string[]).includes(locale)) {
    return apiError('unknown_locale');
  }
  cookies.set(UI_LOCALE_COOKIE, locale, { path: '/', httpOnly: true, sameSite: 'lax', secure: !dev, maxAge: ONE_YEAR_S });
  // The browser's PARAGLIDE_LOCALE cookie is never read (the hook sets the
  // locale itself), so drop any stray one.
  cookies.delete('PARAGLIDE_LOCALE', { path: '/' });
  if (locals.user) await setOwnLocale(locals.user.id, locale);
  return new Response(null, { status: 204 });
};
