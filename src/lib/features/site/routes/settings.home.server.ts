// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter for /settings/home, re-exported by src/routes/settings/home/+page.server.ts.
import { requireAction, settingsAudit } from '$lib/features/auth/routes/requireAction.server';
import { getPage } from '$lib/features/pages/server';
import { getHomePageId, setHomePage } from '$lib/features/site/server';
import type { Actions, ServerLoadEvent } from '@sveltejs/kit';

// docs/architecture/logging.md, "The audit subset".
const audit = settingsAudit('home', 'homepage:manage');

export const load = async ({ locals }: ServerLoadEvent) => {
  requireAction(locals.user, 'homepage:manage', locals.log);
  const homeId = await getHomePageId();
  const homePage = homeId ? await getPage(homeId) : null;
  return { homePage };
};

export const actions = {
  setHome: async ({ request, locals }) => {
    requireAction(locals.user, 'homepage:manage', locals.log);
    const f = await request.formData();
    await setHomePage(String(f.get('id') ?? '') || null);
    audit(locals, 'setHome');
    return { ok: true };
  },
  clearHome: async ({ locals }) => {
    requireAction(locals.user, 'homepage:manage', locals.log);
    await setHomePage(null);
    audit(locals, 'clearHome');
    return { ok: true };
  },
} satisfies Actions;
