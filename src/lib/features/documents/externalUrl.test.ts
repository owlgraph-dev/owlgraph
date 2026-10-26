// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { parseExternalUrl, externalHost, safeExternalHref, MAX_EXTERNAL_URL_LENGTH } from './externalUrl';

describe('parseExternalUrl', () => {
  it('keeps http and https URLs, trimmed', () => {
    expect(parseExternalUrl('https://example.org/paper.pdf')).toEqual({ ok: true, url: 'https://example.org/paper.pdf' });
    expect(parseExternalUrl('  http://example.org/a?b=1#c \n')).toEqual({ ok: true, url: 'http://example.org/a?b=1#c' });
  });

  it('rewrites a DOI to its resolver URL, with or without the doi: prefix', () => {
    expect(parseExternalUrl('doi:10.1000/xyz123')).toEqual({ ok: true, url: 'https://doi.org/10.1000/xyz123' });
    expect(parseExternalUrl('DOI: 10.1038/nphys1170')).toEqual({ ok: true, url: 'https://doi.org/10.1038/nphys1170' });
    expect(parseExternalUrl('10.1000/xyz123')).toEqual({ ok: true, url: 'https://doi.org/10.1000/xyz123' });
  });

  it('refuses every scheme but http and https, however it is spelled', () => {
    for (const input of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'java\tscript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'file:///etc/passwd',
      'mailto:team@example.org',
      'ftp://example.org/file',
    ]) {
      const parsed = parseExternalUrl(input);
      expect(parsed.ok, input).toBe(false);
    }
    expect(parseExternalUrl('javascript:alert(1)')).toEqual({ ok: false, reason: 'scheme' });
  });

  it('refuses relative paths, bare words and empty input', () => {
    expect(parseExternalUrl('/docs/intro')).toEqual({ ok: false, reason: 'invalid' });
    expect(parseExternalUrl('example.org')).toEqual({ ok: false, reason: 'invalid' });
    expect(parseExternalUrl('   ')).toEqual({ ok: false, reason: 'empty' });
  });

  it('refuses credentials in the URL', () => {
    expect(parseExternalUrl('https://user:secret@example.org/')).toEqual({ ok: false, reason: 'credentials' });
  });

  it('refuses a URL longer than the bound', () => {
    const long = `https://example.org/${'a'.repeat(MAX_EXTERNAL_URL_LENGTH)}`;
    expect(parseExternalUrl(long)).toEqual({ ok: false, reason: 'too-long' });
  });
});

describe('externalHost', () => {
  it('is the host of a URL, empty for anything else', () => {
    expect(externalHost('https://doi.org/10.1000/x')).toBe('doi.org');
    expect(externalHost('https://cloud.example.org:8443/s/abc')).toBe('cloud.example.org:8443');
    expect(externalHost('not a url')).toBe('');
  });
});

describe('safeExternalHref', () => {
  it('passes a valid stored URL and drops anything else', () => {
    expect(safeExternalHref('https://example.org/a')).toBe('https://example.org/a');
    expect(safeExternalHref('javascript:alert(1)')).toBeNull();
    expect(safeExternalHref(null)).toBeNull();
    expect(safeExternalHref('')).toBeNull();
  });
});
