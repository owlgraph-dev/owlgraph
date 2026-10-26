// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The desktop-first tier cascade every capability shares. Tiers merge
// field by field, so a one-field override needn't restate the tier's others.
export type Tier = 'desktop' | 'tablet' | 'phone';
export const TIERS: readonly Tier[] = ['desktop', 'tablet', 'phone'];
/** The suffix a tier's rules and custom properties carry: `-d`, `-t`, `-p`. */
export const TIER_CHAR: Readonly<Record<Tier, 'd' | 't' | 'p'>> = { desktop: 'd', tablet: 't', phone: 'p' };

export function resolveCapability<T extends object>(
  data: Partial<Record<Tier, Partial<T>>> | null | undefined,
  bp: Tier
): Partial<T> {
  const desktop = data?.desktop ?? {};
  if (bp === 'desktop') return { ...desktop };
  const tablet = { ...desktop, ...(data?.tablet ?? {}) };
  if (bp === 'tablet') return tablet;
  return { ...tablet, ...(data?.phone ?? {}) };
}

/** The tier a canvas of this width renders: the `@container canvas` boundaries (640px, 900px). */
export function canvasTier(width: number): Tier {
  return width <= 640 ? 'phone' : width <= 900 ? 'tablet' : 'desktop';
}

/** True when the given tier holds any own value — the "reset to Auto" action's predicate. */
export function hasOwnValueAt<T extends object>(data: Partial<Record<Tier, Partial<T>>> | null | undefined, bp: Tier): boolean {
  const tier = data?.[bp];
  return !!tier && Object.values(tier).some((v) => v != null);
}

/** The data with every field of one tier set back to Auto — the tier dropped, the others untouched. */
export function clearTier<D extends Partial<Record<Tier, object>>>(data: D | null | undefined, bp: Tier): D {
  const next = { ...(data ?? {}) } as D;
  delete next[bp];
  return next;
}

// A section's modified indicator: across all tiers, so a tablet-only override
// stays visible while editing desktop.
export function hasAnyOwnValue<T extends object>(
  data: Partial<Record<Tier, Partial<T>>> | null | undefined,
  fields?: (keyof T)[]
): boolean {
  if (!data) return false;
  for (const bp of TIERS) {
    const tier = data[bp];
    if (!tier) continue;
    const keys = fields ?? (Object.keys(tier) as (keyof T)[]);
    for (const k of keys) if (tier[k] != null) return true;
  }
  return false;
}
