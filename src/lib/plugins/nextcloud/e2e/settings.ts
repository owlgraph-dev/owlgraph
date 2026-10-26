// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import type { APIRequestContext } from '@playwright/test';
import { expect } from '$tests/e2e/fixtures';
import { formAction } from '$tests/e2e/api';

/** Points the plugin at a stand-in's `origin`, with no cache, switched on unless `enabled` is false. */
export async function configure(request: APIRequestContext, origin: string, enabled = true): Promise<void> {
  const result = await formAction(request, '/settings/integrations/nextcloud?/save', { ...(enabled ? { enabled: 'on' } : {}), origin, cacheSeconds: '0' });
  expect(result.type, JSON.stringify(result)).toBe('success');
}
