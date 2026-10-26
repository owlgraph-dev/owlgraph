// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter for /settings/branding, re-exported by src/routes/settings/branding/+page.server.ts.
import { fail } from '@sveltejs/kit';
import { requireAction, settingsAudit } from '$lib/features/auth/routes/requireAction.server';
import { getCurrentLogo, removeLogo, getUiFontFamily, setUiFontFamily } from '$lib/features/site/server';
// Outside the barrel: the upload is the only importer of the SVG sanitizer (jsdom).
import { replaceLogo, replaceDarkLogo } from '../logoUpload.server';
import {
  getSiteTheme,
  saveSiteThemeColors,
  removeDarkLogo,
  resetSiteThemeColors,
  saveBlockDefaults,
  resetBlockDefaults,
  type ThemeColorsInput,
} from '$lib/features/site/server';
import { getCustomFontEntries } from '$lib/features/content/server';
import {
  listTypographyTokens,
  createTypographyToken,
  updateTypographyToken,
  removeTypographyToken,
  listParagraphStyles,
  createParagraphStyle,
  updateParagraphStyle,
  setParagraphStyleToken,
  setDefaultParagraphStyle,
  deleteParagraphStyle,
  type TypographyTokenInput,
} from '$lib/features/content/server';
import { isParagraphStyleTag, type TypeSize } from '$lib/features/content';
import { localizedTextFromForm } from '$lib/platform/i18n/localizedText.server';
import type { Actions, ServerLoadEvent } from '@sveltejs/kit';
import { formError } from '$lib/platform/formError.server';

// docs/architecture/logging.md, "The audit subset".
const audit = settingsAudit('branding', 'branding:manage');

export const load = async ({ locals }: ServerLoadEvent) => {
  requireAction(locals.user, 'branding:manage', locals.log);
  const [logo, tokens, paragraphStyles, customFonts, uiFontFamily, siteTheme] = await Promise.all([
    getCurrentLogo(),
    listTypographyTokens(),
    listParagraphStyles(),
    getCustomFontEntries(),
    getUiFontFamily(),
    getSiteTheme(),
  ]);
  const darkLogoId = siteTheme.theme.logoDarkAssetId;
  return {
    logo: logo ? { id: logo.id, mime: logo.mime, url: `/api/media/branding/logo/${logo.id}` } : null,
    darkLogo: darkLogoId ? { id: darkLogoId, url: `/api/media/branding/logo/${darkLogoId}` } : null,
    siteTheme: siteTheme.theme,
    tokens,
    paragraphStyles,
    customFonts: customFonts.map((f) => ({ id: f.id, name: f.name })),
    uiFontFamily,
  };
};

// Parsed as-is, not normalized: validateTokenInput refuses an off-scale or
// out-of-range size with a message, where normalizing would clamp it silently.
function sizeFromForm(value: FormDataEntryValue | null): TypeSize | null {
  const raw = String(value ?? '');
  if (raw === '') return null;
  return /^\d+(?:\.\d+)?$/.test(raw) ? Number(raw) : (raw as TypeSize);
}

function tokenInputFromForm(f: FormData): TypographyTokenInput {
  const weight = String(f.get('weight') ?? '');
  const lineHeight = f.get('lineHeight');
  const letterSpacing = f.get('letterSpacing');
  const family = String(f.get('family') ?? '');
  return {
    name: String(f.get('name') ?? '').trim(),
    family: family || null,
    size: sizeFromForm(f.get('size')),
    weight: weight || null,
    lineHeight: lineHeight ? Number(lineHeight) : null,
    letterSpacing: letterSpacing ? Number(letterSpacing) : null,
  };
}

export const actions = {
  upload: async ({ request, locals }) => {
    requireAction(locals.user, 'branding:manage', locals.log);
    const f = await request.formData();
    const file = f.get('file');
    if (!(file instanceof File) || file.size === 0) return formError('image_required');
    const bytes = Buffer.from(await file.arrayBuffer());
    try {
      await replaceLogo({ bytes, mime: file.type, createdBy: locals.user!.id });
    } catch (e) {
      return formError(e);
    }
    audit(locals, 'upload');
    return { ok: true };
  },

  remove: async ({ locals }) => {
    requireAction(locals.user, 'branding:manage', locals.log);
    await removeLogo();
    audit(locals, 'remove');
    return { ok: true };
  },

  uploadDark: async ({ request, locals }) => {
    requireAction(locals.user, 'branding:manage', locals.log);
    const file = (await request.formData()).get('file');
    if (!(file instanceof File) || file.size === 0) return formError('image_required');
    try {
      await replaceDarkLogo({ bytes: Buffer.from(await file.arrayBuffer()), mime: file.type, createdBy: locals.user!.id });
    } catch (e) {
      return formError(e);
    }
    audit(locals, 'uploadDark');
    return { ok: true };
  },

  removeDark: async ({ locals }) => {
    requireAction(locals.user, 'branding:manage', locals.log);
    await removeDarkLogo();
    audit(locals, 'removeDark');
    return { ok: true };
  },

  // One JSON field: the colours are edited and saved together.
  saveColors: async ({ request, locals }) => {
    requireAction(locals.user, 'branding:manage', locals.log);
    let input: ThemeColorsInput;
    try {
      const raw = JSON.parse(String((await request.formData()).get('colors') ?? ''));
      input = {
        accent: typeof raw.accent === 'string' && raw.accent ? raw.accent : null,
        lightAccent: typeof raw.lightAccent === 'string' && raw.lightAccent ? raw.lightAccent : null,
        darkAccent: typeof raw.darkAccent === 'string' && raw.darkAccent ? raw.darkAccent : null,
        appbarLight: typeof raw.appbarLight === 'string' && raw.appbarLight ? raw.appbarLight : null,
        appbarDark: typeof raw.appbarDark === 'string' && raw.appbarDark ? raw.appbarDark : null,
        footerLight: typeof raw.footerLight === 'string' && raw.footerLight ? raw.footerLight : null,
        footerDark: typeof raw.footerDark === 'string' && raw.footerDark ? raw.footerDark : null,
        brand: Array.isArray(raw.brand)
          ? raw.brand.map((b: Record<string, unknown>) => ({ id: typeof b.id === 'string' ? b.id : null, name: String(b.name ?? ''), light: String(b.light ?? ''), dark: String(b.dark ?? '') }))
          : [],
      };
    } catch {
      return fail(400, { colorErrors: { brand: 'invalid' } });
    }
    const result = await saveSiteThemeColors(input);
    if ('errors' in result) return fail(400, { colorErrors: result.errors });
    audit(locals, 'saveColors');
    return { colorsSaved: true };
  },

  resetColors: async ({ locals }) => {
    requireAction(locals.user, 'branding:manage', locals.log);
    await resetSiteThemeColors();
    audit(locals, 'resetColors');
    return { colorsSaved: true };
  },

  // One JSON field, saved as one matrix (docs/architecture/blocks/capabilities.md, "Capability defaults").
  saveBlockDefaults: async ({ request, locals }) => {
    requireAction(locals.user, 'branding:manage', locals.log);
    let raw: unknown;
    try {
      raw = JSON.parse(String((await request.formData()).get('blockDefaults') ?? ''));
    } catch {
      return formError('invalid_block_defaults');
    }
    await saveBlockDefaults(raw);
    audit(locals, 'saveBlockDefaults');
    return { blockDefaultsSaved: true };
  },

  resetBlockDefaults: async ({ locals }) => {
    requireAction(locals.user, 'branding:manage', locals.log);
    await resetBlockDefaults();
    audit(locals, 'resetBlockDefaults');
    return { blockDefaultsSaved: true };
  },

  createTypographyToken: async ({ request, locals }) => {
    requireAction(locals.user, 'branding:manage', locals.log);
    const f = await request.formData();
    try {
      await createTypographyToken(tokenInputFromForm(f), locals.user!.id);
    } catch (e) {
      return formError(e);
    }
    audit(locals, 'createTypographyToken');
    return { ok: true };
  },

  updateTypographyToken: async ({ request, locals }) => {
    requireAction(locals.user, 'branding:manage', locals.log);
    const f = await request.formData();
    const id = String(f.get('id') ?? '');
    if (!id) return formError('invalid_request', { field: 'id' });
    try {
      await updateTypographyToken(id, tokenInputFromForm(f));
    } catch (e) {
      return formError(e);
    }
    audit(locals, 'updateTypographyToken');
    return { ok: true };
  },

  removeTypographyToken: async ({ request, locals }) => {
    requireAction(locals.user, 'branding:manage', locals.log);
    const f = await request.formData();
    const id = String(f.get('id') ?? '');
    if (id) await removeTypographyToken(id);
    audit(locals, 'removeTypographyToken');
    return { ok: true };
  },

  // Paragraph styles (docs/architecture/typography.md).
  createParagraphStyle: async ({ request, locals }) => {
    requireAction(locals.user, 'branding:manage', locals.log);
    const f = await request.formData();
    const renderAs = String(f.get('renderAs') ?? '');
    if (!isParagraphStyleTag(renderAs)) return formError('invalid_tag');
    try {
      await createParagraphStyle({ label: localizedTextFromForm(f, 'label', { required: true, what: 'name' }), renderAs, tokenId: String(f.get('tokenId') ?? '') || null });
    } catch (e) {
      return formError(e);
    }
    audit(locals, 'createParagraphStyle');
    return { ok: true };
  },

  updateParagraphStyle: async ({ request, locals }) => {
    requireAction(locals.user, 'branding:manage', locals.log);
    const f = await request.formData();
    try {
      await updateParagraphStyle(String(f.get('id') ?? ''), { label: localizedTextFromForm(f, 'label', { required: true, what: 'name' }), tokenId: String(f.get('tokenId') ?? '') || null });
    } catch (e) {
      return formError(e);
    }
    audit(locals, 'updateParagraphStyle');
    return { ok: true };
  },

  setParagraphStyleToken: async ({ request, locals }) => {
    requireAction(locals.user, 'branding:manage', locals.log);
    const f = await request.formData();
    await setParagraphStyleToken(String(f.get('id') ?? ''), String(f.get('tokenId') ?? '') || null);
    audit(locals, 'setParagraphStyleToken');
    return { ok: true };
  },

  setDefaultParagraphStyle: async ({ request, locals }) => {
    requireAction(locals.user, 'branding:manage', locals.log);
    const f = await request.formData();
    try {
      await setDefaultParagraphStyle(String(f.get('id') ?? ''));
    } catch (e) {
      return formError(e);
    }
    audit(locals, 'setDefaultParagraphStyle');
    return { ok: true };
  },

  deleteParagraphStyle: async ({ request, locals }) => {
    requireAction(locals.user, 'branding:manage', locals.log);
    const f = await request.formData();
    try {
      await deleteParagraphStyle(String(f.get('id') ?? ''));
    } catch (e) {
      return formError(e);
    }
    audit(locals, 'deleteParagraphStyle');
    return { ok: true };
  },

  setUiFont: async ({ request, locals }) => {
    requireAction(locals.user, 'branding:manage', locals.log);
    const f = await request.formData();
    const family = String(f.get('family') ?? '');
    await setUiFontFamily(family || null);
    audit(locals, 'setUiFont');
    return { ok: true };
  },
} satisfies Actions;
