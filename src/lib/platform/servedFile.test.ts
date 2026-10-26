// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { servedFileHeaders, servedMime } from './servedFile';

const headers = (mime: string, opts: { download?: boolean; filename?: string; length?: number | null } = {}) =>
  servedFileHeaders({ mime, filename: opts.filename ?? 'file', download: opts.download ?? false, cacheControl: 'private, no-store', length: opts.length });

describe('served files', () => {
  it('shows the safe types inline and every other type as a download', () => {
    for (const mime of ['application/pdf', 'text/plain', 'text/markdown', 'image/png', 'image/jpeg', 'image/gif', 'image/webp']) {
      expect(headers(mime)['content-disposition'], mime).toMatch(/^inline;/);
    }
    for (const mime of ['image/svg+xml', 'text/html', 'application/xhtml+xml', 'application/javascript', 'application/octet-stream', 'image/tiff']) {
      expect(headers(mime)['content-disposition'], mime).toMatch(/^attachment;/);
    }
  });

  it('downloads even a safe type when asked to', () => {
    expect(headers('application/pdf', { download: true })['content-disposition']).toMatch(/^attachment;/);
  });

  it('keeps the declared type authoritative and never stored by a shared cache it was not given', () => {
    const h = headers('application/pdf');
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['cache-control']).toBe('private, no-store');
    expect(h['content-type']).toBe('application/pdf');
  });

  it('sandboxes everything but a PDF shown inline', () => {
    expect(headers('text/plain')['content-security-policy']).toBe("default-src 'none'; sandbox");
    expect(headers('image/png')['content-security-policy']).toBe("default-src 'none'; sandbox");
    expect(headers('image/svg+xml')['content-security-policy']).toBe("default-src 'none'; sandbox");
    expect(headers('application/zip')['content-security-policy']).toBe("default-src 'none'; sandbox");
    expect(headers('application/pdf', { download: true })['content-security-policy']).toBe("default-src 'none'; sandbox");
    expect(headers('application/pdf')['content-security-policy']).toBeUndefined();
  });

  it('hands a download over as a byte stream, so no page of this origin can load it as script or style', () => {
    for (const declared of ['application/javascript', 'text/javascript; charset=utf-8', 'text/css', 'image/svg+xml', 'text/html']) {
      const h = headers(declared);
      expect(h['content-type'], declared).toBe('application/octet-stream');
      expect(h['content-disposition'], declared).toMatch(/^attachment;/);
      expect(h['x-content-type-options'], declared).toBe('nosniff');
    }
    expect(headers('text/markdown', { download: true })['content-type']).toBe('application/octet-stream');
  });

  it('serves text as UTF-8 and a declared type by its essence', () => {
    expect(headers('text/plain')['content-type']).toBe('text/plain; charset=utf-8');
    expect(headers('Text/Plain; charset=ISO-8859-1')['content-type']).toBe('text/plain; charset=utf-8');
    expect(servedMime('IMAGE/PNG')).toBe('image/png');
  });

  it('serves anything that is not a type as a plain byte stream, downloaded', () => {
    for (const declared of ['', 'pdf', 'text/html\r\nx-injected: 1', null, undefined]) {
      expect(servedMime(declared)).toBe('application/octet-stream');
    }
    const h = headers('not a type');
    expect(h['content-type']).toBe('application/octet-stream');
    expect(h['content-disposition']).toMatch(/^attachment;/);
  });

  it('declares the length only when it is known', () => {
    expect(headers('application/pdf', { length: 12 })['content-length']).toBe('12');
    expect(headers('application/pdf', { length: null })['content-length']).toBeUndefined();
    expect(headers('application/pdf')['content-length']).toBeUndefined();
  });

  it('names the file in the disposition', () => {
    expect(headers('application/pdf', { filename: 'Bericht 2026.pdf' })['content-disposition']).toBe('inline; filename="Bericht 2026.pdf"');
  });
});
