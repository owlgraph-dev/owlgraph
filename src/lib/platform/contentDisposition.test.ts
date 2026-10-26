// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { contentDisposition } from './contentDisposition';

describe('contentDisposition', () => {
  it('passes a plain ASCII name through', () => {
    expect(contentDisposition('inline', 'bericht.pdf')).toBe('inline; filename="bericht.pdf"');
  });

  it('adds an RFC 8187 filename* for names outside ASCII, with a readable fallback', () => {
    expect(contentDisposition('inline', 'Bericht – Q3.pdf')).toBe(
      `inline; filename="Bericht _ Q3.pdf"; filename*=UTF-8''Bericht%20%E2%80%93%20Q3.pdf`
    );
    expect(contentDisposition('attachment', 'Übersicht.md')).toBe(
      `attachment; filename="Ubersicht.md"; filename*=UTF-8''%C3%9Cbersicht.md`
    );
  });

  it('always yields a value a Response header accepts', () => {
    for (const name of ['報告 ✅.pdf', '“quoted”.txt', 'a"b\r\nSet-Cookie: x=1.pdf', '']) {
      const value = contentDisposition('inline', name);
      expect(() => new Response(null, { headers: { 'content-disposition': value } })).not.toThrow();
      expect(value).not.toMatch(/[\r\n]/);
    }
  });
});
