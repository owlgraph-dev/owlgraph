// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Routes reachable without a session, each enforcing per-page visibility in its
// own load; everything else requires one (src/hooks.server.ts). Each feature
// declares its own in routes/publicRoutes.ts.
import { publicRoutes as auth } from '$lib/features/auth/routes/publicRoutes';
import { publicRoutes as site } from '$lib/features/site/routes/publicRoutes';
import { publicRoutes as reader } from '$lib/features/reader/routes/publicRoutes';
import { publicRoutes as namespaces } from '$lib/features/namespaces/routes/publicRoutes';
import { publicRoutes as content } from '$lib/features/content/routes/publicRoutes';
import { publicRoutes as documents } from '$lib/features/documents/routes/publicRoutes';
import { publicRoutes as media } from '$lib/features/media/routes/publicRoutes';
import { publicRoutes as query } from '$lib/features/query/routes/publicRoutes';
import { publicRoutes as search } from '$lib/features/search/routes/publicRoutes';
import { publicRoutes as integrations } from '$lib/features/pluginHost/routes/publicRoutes';

export const PUBLIC_ROUTES: ReadonlySet<string> = new Set<string>([
  '/api/health',
  // An anonymous reader's browser posts CSP reports too (platform/csp.ts).
  '/api/csp-report',
  // AGPL-3.0 §13: offered to everyone who uses the site.
  '/-/about',
  '/-/license',
  ...auth,
  ...site,
  ...reader,
  ...namespaces,
  ...content,
  ...documents,
  ...media,
  ...query,
  ...search,
  ...integrations,
]);
