// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Best effort: a scanned PDF has no text layer and yields little or nothing,
// and any failure gives an empty string rather than throwing.

import { logEvent, logger, errorClass } from '#lib/platform/logger.server.ts';

export async function extractText(bytes: Buffer, mime: string): Promise<string> {
  if (mime === 'text/plain' || mime === 'text/markdown') return bytes.toString('utf8');
  if (mime === 'application/pdf') return extractPdfText(bytes);
  return '';
}

async function extractPdfText(bytes: Buffer): Promise<string> {
  try {
    // The legacy build runs in Node without a worker thread. `any`: the
    // subpath's bundled types don't always resolve. PDF.js evaluates no code
    // from a document since version 6, which dropped the option that turned
    // that off.
    const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
    // The loading task releases the document, read or not.
    const task = pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
    try {
      const doc = await task.promise;
      const parts: string[] = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        parts.push(content.items.map((it: any) => ('str' in it ? it.str : '')).join(' '));
      }
      return parts.join('\n\n').replace(/[ \t]+\n/g, '\n').trim();
    } finally {
      await task.destroy();
    }
  } catch (err) {
    // An expected outcome, logged without a stack. The class only: the message
    // comes from bytes the user supplied.
    logEvent(logger, 'document.extract_failed', { errorClass: errorClass(err) });
    return '';
  }
}
