// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { test, expect } from '$tests/e2e/fixtures';
import { seed, authState } from '$tests/e2e/seed-data';

// The stamped instances a page serves are queryBlock.http.test.ts's.

test('the editor shows only the single placeholder-value authoring instance, never stamped output', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: authState('editorA') });
  const p = await ctx.newPage();
  await p.goto(`/${seed.queryTestSlug}/edit`);
  await expect(p.locator('.query-block')).toContainText('placeholder');
  await expect(p.locator('.query-block-instance')).toHaveCount(0);
  await ctx.close();
});
