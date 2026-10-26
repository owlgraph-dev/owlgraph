// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A node's credential as the host seals it (docs/architecture/authorization.md, "Credentials
// at rest"): bound to its node and the service address it was made for, so a
// value copied onto another node, or of another address, opens as nothing.

export interface SecretBinding {
  node: string;
  origin: string;
}

interface Bound extends SecretBinding {
  v: 2;
  value: string;
}

export function bindSecret(value: string, binding: SecretBinding): string {
  return JSON.stringify({ v: 2, node: binding.node, origin: binding.origin, value } satisfies Bound);
}

/** Null for another node's, another address's, or anything else. */
export function openBoundSecret(plaintext: string, binding: SecretBinding): string | null {
  try {
    const parsed = JSON.parse(plaintext) as Partial<Bound> | null;
    if (parsed && typeof parsed === 'object' && parsed.v === 2 && typeof parsed.value === 'string' && parsed.node === binding.node && parsed.origin === binding.origin) {
      return parsed.value;
    }
  } catch {
    // Not one of ours.
  }
  return null;
}
