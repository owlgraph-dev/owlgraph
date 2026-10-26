// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The site home (rendered at "/"), by page id: one site_settings key, owned here.
import { getSetting, setSetting } from '$lib/platform/settings.server';

export async function getHomePageId(): Promise<string | null> {
  return getSetting('home_page_id');
}

export async function setHomePage(id: string | null): Promise<void> {
  await setSetting('home_page_id', id);
}
