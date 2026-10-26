// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter for /, re-exported by src/routes/+page.server.ts.
import { redirect } from '@sveltejs/kit';
import { listPagesForUser, getPage, userCanReadPage } from '$lib/features/pages/server';
import { getHomePageId } from '$lib/features/site/server';
import { can } from '$lib/features/auth/server';
import { nodePath } from '$lib/features/nodes';
import type { ServerLoadEvent } from '@sveltejs/kit';

// "/" redirects (temporarily) to the home page, so it renders through the one
// page route. Without a home page the viewer can read, an anonymous visitor gets
// a welcome naming nothing of the site (an internal home page stays unnamed); a
// signed-in user the pages they can read.
export const load = async ({ locals }: ServerLoadEvent) => {
  const user = locals.user;
  const homeId = await getHomePageId();
  if (homeId) {
    const page = await getPage(homeId);
    if (page && (await userCanReadPage(user, page))) {
      throw redirect(307, nodePath(page.namespace_slug, page.slug));
    }
  }
  if (!user) return { welcome: true as const };
  return {
    welcome: false as const,
    pages: await listPagesForUser(user),
    canCreate: can(user, 'page:write'),
    canSetHome: can(user, 'homepage:manage'),
  };
};
