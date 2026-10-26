// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The plugin's node views (docs/architecture/plugins.md, "Node views"); the server half's
// nodeView (server/nodeView.server.ts) resolves what they start from.
import { definePluginNodeViews } from '$lib/plugins/api';
import { nextcloud } from './index';
import CollectionBody from './views/CollectionBody.svelte';

export const nextcloudNodeViews = definePluginNodeViews(nextcloud, {
  id: 'nextcloud',
  collection: CollectionBody,
});
