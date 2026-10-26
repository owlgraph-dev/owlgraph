// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The nonce a <style> needs for the document's style-src (csp.ts). In the
// browser it is the one the document was born with, not the latest load's: the
// root layout reruns on invalidation with a nonce the policy never heard of.
// Browsers hide the attribute but keep the `nonce` property readable.
let documentNonce: string | null = null;

export function styleNonceFor(loadNonce: string): string {
  if (typeof document === 'undefined') return loadNonce;
  if (documentNonce == null) {
    const first = document.querySelector<HTMLStyleElement>('style[nonce]');
    documentNonce = first?.nonce || loadNonce;
  }
  return documentNonce;
}
