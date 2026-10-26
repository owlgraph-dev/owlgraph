// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { safeLinkHref } from './linkHref';

describe('safeLinkHref', () => {
  it('keeps web, mail, phone, relative and anchor links', () => {
    for (const href of [
      'https://example.org/a?b=1#c',
      'http://example.org',
      'mailto:team@example.org',
      'tel:+49301234567',
      '/docs/intro',
      'intro',
      '../up',
      '#section-2',
      '?tab=2',
      '//cdn.example.org/file.pdf',
    ]) {
      expect(safeLinkHref(href)).toBe(href);
    }
  });

  it('refuses script-capable and other schemes, however they are spelled', () => {
    for (const href of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      ' javascript:alert(1)',
      'java\tscript:alert(1)',
      'java\nscript:alert(1)',
      '\u0001javascript:alert(1)',
      'vbscript:msgbox(1)',
      'data:text/html,<script>alert(1)</script>',
      'file:///etc/passwd',
    ]) {
      expect(safeLinkHref(href), JSON.stringify(href)).toBe('#');
    }
  });

  it('falls back to # for non-strings and empty values', () => {
    expect(safeLinkHref(undefined)).toBe('#');
    expect(safeLinkHref(42)).toBe('#');
    expect(safeLinkHref('   ')).toBe('#');
  });
});
