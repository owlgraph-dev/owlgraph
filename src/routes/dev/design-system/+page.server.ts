// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The design-system playground (docs/architecture/design-system/overview.md, "Playground"): on under
// `vite dev`, off in a build unless ENABLE_DESIGN_PLAYGROUND=true, and behind a
// session. Gated here because the design system stays free of $app/*.
import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
  if (!dev && process.env.ENABLE_DESIGN_PLAYGROUND !== 'true') error(404, 'Not found');
  return {};
};
