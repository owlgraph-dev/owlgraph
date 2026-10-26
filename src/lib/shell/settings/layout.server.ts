// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The /settings layout's route adapter (src/routes/settings/+layout.server.ts).
// It gates nothing, as a layout load never protects a direct POST: it says
// which sections the viewer may see, and each section's adapter enforces its
// action with requireAction. No DB work: it reruns on every form action.
import { can } from '$lib/features/auth/server';
import { SETTINGS_TREE } from './tree';
import { requiredActions } from './treeModel';
import type { ServerLoadEvent } from '@sveltejs/kit';

export const load = async ({ locals }: ServerLoadEvent) => ({
  permissions: requiredActions(SETTINGS_TREE).filter((a) => can(locals.user, a)),
});
