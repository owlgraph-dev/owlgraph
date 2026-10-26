// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The card's looks (docs/architecture/blocks/node-embeds.md, "Quick link variants"). A variant
// decides which Surface fields the card carries at all; other stored fields are
// kept but neither emitted nor shown. Enforced alike by quickLinkSurface,
// quickLink.css's pins and the block settings panel. Without a stored variant it is
// inferred from the surface.
import { normalizeSurfaceData, pruneSurface, resolvedBg, resolvedBorder, type SurfaceData, type SurfaceDefaults, type SurfaceValue, type SurfaceBoxField } from '../../capabilities/surface/surface';
import type { DefaultValues } from '../../capabilities/defaults/blockDefaults';

export const QUICK_LINK_VARIANTS = ['link', 'outlined', 'button'] as const;
export type QuickLinkVariant = (typeof QUICK_LINK_VARIANTS)[number];

export function quickLinkVariantOrNull(v: unknown): QuickLinkVariant | null {
  return v === 'link' || v === 'outlined' || v === 'button' ? v : null;
}

type SurfaceField = SurfaceBoxField;

/** The Surface fields each variant carries. */
export const QUICK_LINK_VARIANT_FIELDS: Record<QuickLinkVariant, readonly SurfaceField[]> = {
  link: ['radius'],
  outlined: ['border', 'radius', 'shadow'],
  button: ['bg', 'border', 'radius', 'shadow'],
};

/** A variant's look when neither the card nor the theme says more. */
const BUILTIN_LOOK: Record<QuickLinkVariant, Partial<SurfaceDefaults>> = {
  link: {},
  outlined: { border: 'token:border-strong' },
  button: { bg: 'token:accent' },
};

/** Stored, else inferred from the surface. */
export function quickLinkVariant(attrs: { variant?: unknown; surface?: SurfaceData | null } | null | undefined): QuickLinkVariant {
  const stored = quickLinkVariantOrNull(attrs?.variant);
  if (stored) return stored;
  // 'phone' resolves through every tier, so this asks "set at any tier".
  if (resolvedBg(attrs?.surface, 'phone')) return 'button';
  if (resolvedBorder(attrs?.surface, 'phone')) return 'outlined';
  return 'link';
}

/** The surface data reduced to the variant's fields, per tier; empty tiers dropped. */
export function quickLinkSurface(attrs: { variant?: unknown; surface?: SurfaceData | null } | null | undefined): SurfaceData {
  const fields = QUICK_LINK_VARIANT_FIELDS[quickLinkVariant(attrs)];
  const src = normalizeSurfaceData(attrs?.surface);
  const out: SurfaceData = {};
  for (const bp of ['desktop', 'tablet', 'phone'] as const) {
    const tier = src[bp];
    if (!tier) continue;
    const next: SurfaceValue = {};
    for (const field of fields) if (tier[field] != null) (next as Record<string, unknown>)[field] = tier[field];
    if (Object.keys(next).length > 0) out[bp] = next;
  }
  return out;
}

/**
 * The cards group's default where the theme sets one, else the variant's
 * built-in look; null for a field the variant doesn't carry.
 */
export function quickLinkDefaults(variant: QuickLinkVariant, cardDefaults: DefaultValues): SurfaceDefaults {
  const fields = QUICK_LINK_VARIANT_FIELDS[variant];
  const pick = <F extends SurfaceField>(field: F): SurfaceDefaults[F] =>
    (fields.includes(field) ? (cardDefaults[field] ?? BUILTIN_LOOK[variant][field] ?? null) : null) as SurfaceDefaults[F];
  return { bg: pick('bg'), border: pick('border'), radius: pick('radius'), shadow: pick('shadow') };
}

/**
 * Prunes only the variant's fields; the others stay as stored, for the
 * variant that carries them.
 */
export function pruneQuickLinkSurface(attrs: { variant?: unknown; surface?: SurfaceData | null }, cardDefaults: DefaultValues): SurfaceData {
  const variant = quickLinkVariant(attrs);
  const fields = new Set<SurfaceField>(QUICK_LINK_VARIANT_FIELDS[variant]);
  const src = normalizeSurfaceData(attrs.surface);
  const pruned = pruneSurface(quickLinkSurface(attrs), quickLinkDefaults(variant, cardDefaults));
  const out: SurfaceData = {};
  for (const bp of ['desktop', 'tablet', 'phone'] as const) {
    const tier = src[bp];
    if (!tier) continue;
    const next: SurfaceValue = {};
    for (const [field, value] of Object.entries(tier) as [SurfaceField, unknown][]) {
      if (!fields.has(field)) (next as Record<string, unknown>)[field] = value;
    }
    for (const [field, value] of Object.entries(pruned[bp] ?? {})) (next as Record<string, unknown>)[field] = value;
    if (Object.keys(next).length > 0) out[bp] = next;
  }
  return out;
}
