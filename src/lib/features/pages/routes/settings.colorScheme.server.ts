// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter, re-exported by src/routes/settings/color-scheme/+page.server.ts
// (docs/architecture/theming.md, "Letting pages adapt"). The report and the pinning run
// under the viewer's own permissions (readiness.server.ts).
import { type Actions, type ServerLoadEvent } from '@sveltejs/kit';
import { requireAction, settingsAudit } from '$lib/features/auth/routes/requireAction.server';
import { isContentScheme, themeColorShortfalls } from '$lib/features/content';
import { getContentSchemeDefault, setContentSchemeDefault } from '$lib/features/content/server';
import { keepPagesLight, siteReadiness } from '$lib/features/pages/server';
import { getSiteTheme } from '$lib/features/site/server';
import { formError } from '$lib/platform/formError.server';

// docs/architecture/logging.md, "The audit subset".
const audit = settingsAudit('color-scheme', 'branding:manage');

export const load = async ({ locals, parent }: ServerLoadEvent) => {
  requireAction(locals.user, 'branding:manage', locals.log);
  // The root layout's load makes the site theme the one readiness and the
  // palette check resolve against: wait for it, don't race it.
  await parent();
  const [schemeDefault, readiness] = await Promise.all([getContentSchemeDefault(), siteReadiness(locals.user!)]);
  return { schemeDefault, readiness, themeColorShortfalls: themeColorShortfalls() };
};

export const actions = {
  setDefault: async ({ request, locals }) => {
    requireAction(locals.user, 'branding:manage', locals.log);
    const scheme = (await request.formData()).get('scheme');
    if (!isContentScheme(scheme)) return formError('invalid_content_scheme');
    // An action runs without the root layout's load, so getSiteTheme makes the
    // stored theme the one checked, not whichever a page last rendered with.
    if (scheme === 'adaptive') {
      await getSiteTheme();
      if (themeColorShortfalls().length) return formError('theme_colors_unreadable');
    }
    await setContentSchemeDefault(scheme);
    audit(locals, 'setDefault', { payload: String(scheme) });
    return { saved: scheme };
  },
  keepLight: async ({ request, locals }) => {
    requireAction(locals.user, 'branding:manage', locals.log);
    const ids = (await request.formData()).getAll('id').map(String);
    const pinned = await keepPagesLight(locals.user!, ids);
    audit(locals, 'keepLight', { payload: String(pinned) });
    return { pinned };
  },
} satisfies Actions;
