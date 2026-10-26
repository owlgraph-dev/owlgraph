// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The site theme's storage (docs/architecture/theming.md, "Site theme"): the `site` row of
// `themes`, validated here. Its updated_at is the version the emitted CSS is
// cached under, so a save needs no process-wide invalidation. No media or SVG
// handling (logoUpload.server.ts has it), so the MCP server doesn't pull jsdom.
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { db, type JsonArg } from '$lib/platform/db.server';
import {
  BRAND_ID,
  EMPTY_THEME,
  THEME_COLOR,
  accentShortfalls,
  compileTheme,
  schemeAccent,
  setActiveTheme,
  type BrandColor,
  type Shortfall,
  type StoredTheme,
} from '$lib/design-system/theme/siteTheme';
import { SCHEME_NAMES, type SchemeName } from '$lib/design-system/theme/tokens';
import { compileContentTheme, isColorReference, normalizeBlockDefaults, setBlockDefaults, WIDTH_BOUNDS, type WidthToken } from '$lib/features/content';

const color = z.string().regex(THEME_COLOR);

// Capability defaults (docs/architecture/blocks/capabilities.md, "Capability defaults") are steps and
// theme-colour references only, never a literal, so they adapt to the scheme.
const step = z.enum(['none', 'sm', 'md', 'lg']);
const colorRef = z.string().refine((v) => isColorReference(v), 'a theme colour reference');
const width = (token: WidthToken) => z.number().int().min(WIDTH_BOUNDS[token].min).max(WIDTH_BOUNDS[token].max).optional();
const groupDefaultsSchema = z
  .object({
    pad: step.optional(),
    radius: step.optional(),
    shadow: z.enum(['none', 'sm', 'md', 'lg']).optional(),
    border: colorRef.optional(),
    bg: colorRef.optional(),
    blockSpace: step.optional(),
  })
  .strict();
const blockDefaultsSchema = z
  .object({
    page: z
      .object({
        blockSpace: step.optional(),
        widths: z.object({ read: width('read'), wide: width('wide'), max: width('max') }).strict().optional(),
        gutters: z.object({ desktop: step.optional(), tablet: step.optional(), phone: step.optional() }).strict().optional(),
      })
      .strict()
      .optional(),
    groups: z
      .object({
        text: groupDefaultsSchema.optional(),
        containers: groupDefaultsSchema.optional(),
        media: groupDefaultsSchema.optional(),
        cards: groupDefaultsSchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const storedThemeSchema = z.object({
  version: z.literal(1),
  accent: color.nullable().optional(),
  schemes: z
    .object({ light: z.object({ accent: color.nullable().optional() }).optional(), dark: z.object({ accent: color.nullable().optional() }).optional() })
    .optional(),
  brand: z
    .array(z.object({ id: z.string().regex(BRAND_ID), name: z.string().trim().min(1).max(60), light: color, dark: color }))
    .max(24)
    .optional(),
  appbar: z.object({ light: color.nullable().optional(), dark: color.nullable().optional() }).optional(),
  footer: z.object({ light: color.nullable().optional(), dark: color.nullable().optional() }).optional(),
  logoDarkAssetId: z.string().uuid().nullable().optional(),
  blockDefaults: blockDefaultsSchema.optional(),
});

export interface SiteTheme {
  theme: StoredTheme;
  /** The row's updated_at, or null while the site has no theme row. */
  version: string | null;
}

export const SITE_THEME_CONFLICT = `(scope_kind, (coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)))`;

/**
 * The stored site theme and its version, also made the theme server-side colour
 * reasoning resolves against. A row that fails validation reads as no theme.
 */
export async function getSiteTheme(): Promise<SiteTheme> {
  const [row] = await db<{ tokens: unknown; updated_at: Date }[]>`select tokens, updated_at from themes where scope_kind = 'site'`;
  const parsed = row ? storedThemeSchema.safeParse(row.tokens) : null;
  const site: SiteTheme = parsed?.success ? { theme: parsed.data, version: row.updated_at.toISOString() } : { theme: EMPTY_THEME, version: null };
  setActiveTheme(compileTheme(site.theme, site.version));
  // Likewise the capability defaults: a block's ground when it sets no background.
  setBlockDefaults(compileContentTheme(site.theme, site.version).blockDefaults);
  return site;
}

async function writeSiteTheme(theme: StoredTheme): Promise<void> {
  await db`
    insert into themes (scope_kind, tokens) values ('site', ${db.json(theme as unknown as JsonArg)})
    on conflict ${db.unsafe(SITE_THEME_CONFLICT)} do update set tokens = excluded.tokens, updated_at = now()`;
}

export interface ThemeColorsInput {
  accent: string | null;
  lightAccent: string | null;
  darkAccent: string | null;
  appbarLight: string | null;
  appbarDark: string | null;
  footerLight: string | null;
  footerDark: string | null;
  /** A new colour has no id yet; one is assigned. */
  brand: { id?: string | null; name: string; light: string; dark: string }[];
}

export type ThemeColorErrors = Partial<
  Record<'accent' | 'lightAccent' | 'darkAccent' | 'appbarLight' | 'appbarDark' | 'footerLight' | 'footerDark' | 'brand', string>
> & {
  /** Shortfalls of a hand-set accent, per scheme, for the admin to see what misses. */
  shortfalls?: Partial<Record<SchemeName, Shortfall[]>>;
};

const newBrandId = () => randomBytes(6).toString('hex').slice(0, 10);

/**
 * Validates colours an admin submits: values are `#rrggbb`, names are set, and
 * a hand-set accent meets its scheme's accent bars. Returns the theme to store
 * (the stored dark logo and capability defaults carried over), or the errors.
 */
export function validateThemeColors(current: StoredTheme, input: ThemeColorsInput): { theme: StoredTheme } | { errors: ThemeColorErrors } {
  const errors: ThemeColorErrors = {};
  const valid = (v: string | null) => v === null || THEME_COLOR.test(v);
  if (!valid(input.accent)) errors.accent = 'invalid';
  const overrides: Record<SchemeName, string | null> = { light: input.lightAccent, dark: input.darkAccent };
  for (const scheme of SCHEME_NAMES) {
    const key = scheme === 'light' ? 'lightAccent' : 'darkAccent';
    const value = overrides[scheme];
    if (!valid(value)) {
      errors[key] = 'invalid';
      continue;
    }
    if (value) {
      const soft = schemeAccent({ version: 1, schemes: { [scheme]: { accent: value } } }, scheme).soft;
      const shortfalls = accentShortfalls(scheme, value, soft);
      if (shortfalls.length) {
        errors[key] = 'contrast';
        errors.shortfalls = { ...errors.shortfalls, [scheme]: shortfalls };
      }
    }
  }
  for (const [key, value] of [
    ['appbarLight', input.appbarLight],
    ['appbarDark', input.appbarDark],
    ['footerLight', input.footerLight],
    ['footerDark', input.footerDark],
  ] as const) {
    if (!valid(value)) errors[key] = 'invalid';
  }
  const brand: BrandColor[] = [];
  const ids = new Set<string>();
  for (const entry of input.brand) {
    const name = entry.name.trim();
    if (!name || name.length > 60 || !THEME_COLOR.test(entry.light) || !THEME_COLOR.test(entry.dark)) {
      errors.brand = 'invalid';
      continue;
    }
    let id = entry.id && BRAND_ID.test(entry.id) ? entry.id : newBrandId();
    while (ids.has(id)) id = newBrandId();
    ids.add(id);
    brand.push({ id, name, light: entry.light.toLowerCase(), dark: entry.dark.toLowerCase() });
  }
  if (brand.length > 24) errors.brand = 'too-many';
  if (Object.keys(errors).length) return { errors };
  return {
    theme: {
      version: 1,
      accent: input.accent?.toLowerCase() ?? null,
      schemes: { light: { accent: input.lightAccent?.toLowerCase() ?? null }, dark: { accent: input.darkAccent?.toLowerCase() ?? null } },
      brand,
      appbar: { light: input.appbarLight?.toLowerCase() ?? null, dark: input.appbarDark?.toLowerCase() ?? null },
      footer: { light: input.footerLight?.toLowerCase() ?? null, dark: input.footerDark?.toLowerCase() ?? null },
      logoDarkAssetId: current.logoDarkAssetId ?? null,
      ...(current.blockDefaults ? { blockDefaults: current.blockDefaults } : {}),
    },
  };
}

/**
 * Stores the capability defaults' sparse picks, normalized: an invalid step or a
 * literal colour is dropped rather than refused, since the editor offers only valid ones.
 */
export async function saveBlockDefaults(input: unknown): Promise<void> {
  const { theme } = await getSiteTheme();
  const blockDefaults = normalizeBlockDefaults(input);
  const next: StoredTheme = { ...theme };
  if (Object.keys(blockDefaults).length) next.blockDefaults = blockDefaults;
  else delete next.blockDefaults;
  await writeSiteTheme(next);
}

/** Back to the built-in defaults: the picks go, the rest of the theme stays. */
export async function resetBlockDefaults(): Promise<void> {
  await saveBlockDefaults({});
}

export async function saveSiteThemeColors(input: ThemeColorsInput): Promise<{ ok: true } | { errors: ThemeColorErrors }> {
  const { theme } = await getSiteTheme();
  const result = validateThemeColors(theme, input);
  if ('errors' in result) return result;
  await writeSiteTheme(result.theme);
  return { ok: true };
}

/**
 * Resets the site theme's colours to the built-in ones. The dark logo and the
 * capability defaults stay; with neither, the row goes.
 */
export async function resetSiteThemeColors(): Promise<void> {
  const { theme } = await getSiteTheme();
  const kept: StoredTheme = { version: 1 };
  if (theme.logoDarkAssetId) kept.logoDarkAssetId = theme.logoDarkAssetId;
  if (theme.blockDefaults) kept.blockDefaults = theme.blockDefaults;
  if (Object.keys(kept).length > 1) await writeSiteTheme(kept);
  else await db`delete from themes where scope_kind = 'site'`;
}
