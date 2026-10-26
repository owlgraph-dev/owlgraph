// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter for /settings/languages, re-exported by src/routes/settings/languages/+page.server.ts.
// The default is always enabled: saving it enables it, so its disabled checkbox need not post (docs/architecture/languages.md).
import { requireAction, settingsChanged } from '$lib/features/auth/routes/requireAction.server';
import { loadSiteLocaleConfig, saveSiteLocaleConfig } from '$lib/platform/i18n/siteLocales.server';
import { SUPPORTED_LOCALES } from '$lib/platform/i18n/siteLocales';
import type { Actions, ServerLoadEvent } from '@sveltejs/kit';
import { formError } from '$lib/platform/formError.server';

// Bound once, so an audited action's section and permission can't drift
// (docs/architecture/logging.md, "The audit subset").
const SECTION = 'languages';
const PERMISSION = 'locale:manage';

const describe = (config: { enabled: readonly string[]; defaultLocale: string }) => `${config.enabled.join(',')}; default ${config.defaultLocale}`;

export const load = async ({ locals }: ServerLoadEvent) => {
  requireAction(locals.user, 'locale:manage', locals.log);
  return { config: await loadSiteLocaleConfig(), supported: [...SUPPORTED_LOCALES] };
};

export const actions = {
  save: async ({ request, locals }) => {
    requireAction(locals.user, 'locale:manage', locals.log);
    const f = await request.formData();
    const defaultLocale = String(f.get('defaultLocale') ?? '');
    const enabled = [...new Set([...f.getAll('enabled').map(String), defaultLocale])];
    const before = await loadSiteLocaleConfig();
    try {
      const after = await saveSiteLocaleConfig({ enabled, defaultLocale });
      settingsChanged(locals.log, locals.user, { section: SECTION, permission: PERMISSION, operation: 'save', from: describe(before), to: describe(after) });
    } catch (e) {
      return formError(e);
    }
    return { saved: true };
  },
} satisfies Actions;
