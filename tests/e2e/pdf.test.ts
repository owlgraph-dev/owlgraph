// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { minimalPdf } from './pdf';

// Checked without a PDF reader: PDF.js loads a native canvas binding that can
// bring a worker thread's run down on exit.
describe('the seed’s minimal PDF', () => {
  const pdf = minimalPdf('restricted document').toString('latin1');

  it('is a one-page PDF 1.4 file, whole', () => {
    expect(pdf.startsWith('%PDF-1.4\n')).toBe(true);
    expect(pdf.endsWith('%%EOF\n')).toBe(true);
    expect(pdf).toContain('/Type /Page ');
    expect(pdf).toContain('/Count 1');
  });

  it('has a cross-reference table whose offsets point at its objects', () => {
    const startxref = Number(/startxref\n(\d+)\n/.exec(pdf)?.[1]);
    expect(pdf.slice(startxref, startxref + 4)).toBe('xref');
    const offsets = [...pdf.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(offsets).toHaveLength(5);
    offsets.forEach((offset, i) => expect(pdf.slice(offset, offset + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
  });

  it('says its line of text in a content stream of the declared length', () => {
    const [, length, stream] = /<< \/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/.exec(pdf) ?? [];
    expect(stream).toBe('BT /F1 12 Tf 72 720 Td (restricted document) Tj ET');
    expect(Number(length)).toBe(stream.length);
  });

  it('escapes what PDF strings reserve', () => {
    expect(minimalPdf('a (b) \\ c').toString('latin1')).toContain('(a \\(b\\) \\\\ c) Tj');
  });
});
