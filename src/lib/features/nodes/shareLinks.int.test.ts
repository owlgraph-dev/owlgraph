// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, inject, it } from 'vitest';
import { createShareLink, resolveShareLink, revokeShareLink } from './server';

const seed = inject('seed');

describe('revoking a share link', () => {
  it('through another node leaves it working; through its own node ends it', async () => {
    const link = await createShareLink(seed.restrictedId, null, 'integration link');
    await revokeShareLink(link.id, seed.publicId);
    expect(await resolveShareLink(link.token)).toMatchObject({ nodeId: seed.restrictedId });

    await revokeShareLink(link.id, seed.restrictedId);
    expect(await resolveShareLink(link.token)).toBeNull();
  });
});
