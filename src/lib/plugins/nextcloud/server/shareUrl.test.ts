// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { parseShareUrl } from './shareUrl';

const ORIGIN = 'https://cloud.example.org';

describe("a share's link", () => {
  it('names its token, with or without index.php, a trailing slash or /download', () => {
    for (const link of [
      `${ORIGIN}/s/AbC123xyz`,
      `${ORIGIN}/s/AbC123xyz/`,
      `${ORIGIN}/index.php/s/AbC123xyz`,
      `${ORIGIN}/s/AbC123xyz/download`,
      `  ${ORIGIN}/s/AbC123xyz?path=%2FReports  `,
      `https://CLOUD.example.org:443/s/AbC123xyz`,
    ]) {
      expect(parseShareUrl(link, ORIGIN), link).toEqual({ token: 'AbC123xyz' });
    }
  });

  it('is refused when it points at another server — whatever its path says', () => {
    for (const link of ['https://evil.example/s/AbC123xyz', 'http://cloud.example.org/s/AbC123xyz', 'https://cloud.example.org:8443/s/AbC123xyz', 'https://cloud.example.org.evil.example/s/AbC123xyz']) {
      expect(parseShareUrl(link, ORIGIN), link).toEqual({ problem: 'other-origin' });
    }
  });

  it('is refused when it is not a public share', () => {
    for (const link of [`${ORIGIN}/`, `${ORIGIN}/apps/files/?dir=/x`, `${ORIGIN}/s/`, `${ORIGIN}/s/abc`, `${ORIGIN}/s/AbC123xyz/other`, `${ORIGIN}/s/Ab%2FC123`, `${ORIGIN}/x/s/AbC123xyz`]) {
      expect(parseShareUrl(link, ORIGIN), link).toEqual({ problem: 'not-a-share' });
    }
  });

  it('is refused when it is no link, or carries credentials', () => {
    expect(parseShareUrl('cloud.example.org/s/AbC123xyz', ORIGIN)).toEqual({ problem: 'invalid' });
    expect(parseShareUrl('', ORIGIN)).toEqual({ problem: 'invalid' });
    expect(parseShareUrl('https://user:pw@cloud.example.org/s/AbC123xyz', ORIGIN)).toEqual({ problem: 'invalid' });
  });
});
