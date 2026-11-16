// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { minimalPdf } from '$tests/e2e/pdf';
import { extractText } from './extract.server';

// What search reads of an upload (docs/architecture/documents.md): a failure is
// an empty string, never an error, so a broken extraction would pass unnoticed
// anywhere but here.
describe('extracting an upload’s text', () => {
  it('reads the text layer of a PDF', async () => {
    const text = await extractText(minimalPdf('Quarterly report of the owlgraph project'), 'application/pdf');
    expect(text).toBe('Quarterly report of the owlgraph project');
  });

  it('reads the same PDF twice, the first reading released', async () => {
    const pdf = minimalPdf('Read twice');
    expect(await extractText(pdf, 'application/pdf')).toBe('Read twice');
    expect(await extractText(pdf, 'application/pdf')).toBe('Read twice');
  });

  it('gives an empty string for bytes that are no PDF', async () => {
    expect(await extractText(Buffer.from('not a pdf at all'), 'application/pdf')).toBe('');
  });

  it('takes plain text and Markdown as they are', async () => {
    expect(await extractText(Buffer.from('# Notes\nplain'), 'text/markdown')).toBe('# Notes\nplain');
    expect(await extractText(Buffer.from('plain'), 'text/plain')).toBe('plain');
  });
});
