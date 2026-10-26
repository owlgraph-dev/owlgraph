// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter for /settings/footer, re-exported by src/routes/settings/footer/+page.server.ts.
import { requireAction, settingsAudit } from '$lib/features/auth/routes/requireAction.server';
import { getCurrentLogo } from '$lib/features/site/server';
import {
  getFooterAdmin,
  listFooterLegalLinksAdmin,
  createFooterLink,
  updateFooterLink,
  deleteFooterLink,
  reorderFooterLinks,
  setFooterLegalText,
  setFooterBranding,
  type FooterLinkInput,
} from '$lib/features/site/server';
import {
  createTreeNode,
  updateTreeNode,
  deleteTreeNode,
  moveTreeNode,
  indentTreeNode,
  outdentTreeNode,
} from '$lib/features/site/server';
import { readTreeCreateInput, readTreeUpdateInput } from './treeInput.server';
import type { Actions, ServerLoadEvent } from '@sveltejs/kit';
import { formError } from '$lib/platform/formError.server';

// docs/architecture/logging.md, "The audit subset".
const audit = settingsAudit('footer', 'footer:manage');

export const load = async ({ locals }: ServerLoadEvent) => {
  requireAction(locals.user, 'footer:manage', locals.log);
  const [footer, logo] = await Promise.all([getFooterAdmin(), getCurrentLogo()]);
  return { ...footer, logoUrl: logo ? `/api/media/branding/logo/${logo.id}` : null };
};

function readLinkInput(f: FormData): FooterLinkInput {
  const targetType = String(f.get('targetType') ?? 'page') === 'url' ? 'url' : 'page';
  return {
    label: String(f.get('label') ?? ''),
    targetType,
    targetPageId: targetType === 'page' ? String(f.get('targetPageId') ?? '') || null : null,
    url: targetType === 'url' ? String(f.get('url') ?? '') || null : null,
  };
}

// Swaps within the flat legal-links list and persists the whole order.
async function moveWithin(
  list: { id: string }[],
  id: string,
  direction: string,
  reorder: (orderedIds: string[]) => Promise<void>
) {
  const idx = list.findIndex((e) => e.id === id);
  if (idx === -1) return formError('entry_not_found');
  const swapWith = direction === 'up' ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= list.length) return { ok: true };
  const ids = list.map((e) => e.id);
  [ids[idx], ids[swapWith]] = [ids[swapWith], ids[idx]];
  await reorder(ids);
  return { ok: true };
}

export const actions = {
  createColumnEntry: async ({ request, locals }) => {
    requireAction(locals.user, 'footer:manage', locals.log);
    const f = await request.formData();
    try {
      await createTreeNode('footer', readTreeCreateInput(f));
    } catch (e) {
      return formError(e);
    }
    audit(locals, 'createColumnEntry');
    return { ok: true };
  },

  updateColumnEntry: async ({ request, locals }) => {
    requireAction(locals.user, 'footer:manage', locals.log);
    const f = await request.formData();
    const id = String(f.get('id') ?? '');
    try {
      await updateTreeNode(id, readTreeUpdateInput(f));
    } catch (e) {
      return formError(e);
    }
    audit(locals, 'updateColumnEntry');
    return { ok: true };
  },

  deleteColumnEntry: async ({ request, locals }) => {
    requireAction(locals.user, 'footer:manage', locals.log);
    const f = await request.formData();
    await deleteTreeNode(String(f.get('id') ?? ''));
    audit(locals, 'deleteColumnEntry');
    return { ok: true };
  },

  moveColumnEntry: async ({ request, locals }) => {
    requireAction(locals.user, 'footer:manage', locals.log);
    const f = await request.formData();
    const id = String(f.get('id') ?? '');
    const direction = String(f.get('direction') ?? '') === 'down' ? 'down' : 'up';
    try {
      await moveTreeNode(id, direction);
    } catch (e) {
      return formError(e);
    }
    audit(locals, 'moveColumnEntry');
    return { ok: true };
  },

  indentColumnEntry: async ({ request, locals }) => {
    requireAction(locals.user, 'footer:manage', locals.log);
    const f = await request.formData();
    try {
      await indentTreeNode(String(f.get('id') ?? ''));
    } catch (e) {
      return formError(e);
    }
    audit(locals, 'indentColumnEntry');
    return { ok: true };
  },

  outdentColumnEntry: async ({ request, locals }) => {
    requireAction(locals.user, 'footer:manage', locals.log);
    const f = await request.formData();
    try {
      await outdentTreeNode(String(f.get('id') ?? ''));
    } catch (e) {
      return formError(e);
    }
    audit(locals, 'outdentColumnEntry');
    return { ok: true };
  },

  createLegalLink: async ({ request, locals }) => {
    requireAction(locals.user, 'footer:manage', locals.log);
    const f = await request.formData();
    try {
      await createFooterLink(readLinkInput(f));
    } catch (e) {
      return formError(e);
    }
    audit(locals, 'createLegalLink');
    return { ok: true };
  },

  updateLegalLink: async ({ request, locals }) => {
    requireAction(locals.user, 'footer:manage', locals.log);
    const f = await request.formData();
    try {
      await updateFooterLink(String(f.get('id') ?? ''), readLinkInput(f));
    } catch (e) {
      return formError(e);
    }
    audit(locals, 'updateLegalLink');
    return { ok: true };
  },

  deleteLegalLink: async ({ request, locals }) => {
    requireAction(locals.user, 'footer:manage', locals.log);
    const f = await request.formData();
    await deleteFooterLink(String(f.get('id') ?? ''));
    audit(locals, 'deleteLegalLink');
    return { ok: true };
  },

  moveLegalLink: async ({ request, locals }) => {
    requireAction(locals.user, 'footer:manage', locals.log);
    const f = await request.formData();
    const links = await listFooterLegalLinksAdmin();
    audit(locals, 'moveLegalLink');
    return moveWithin(links, String(f.get('id') ?? ''), String(f.get('direction') ?? ''), reorderFooterLinks);
  },

  saveLegalText: async ({ request, locals }) => {
    requireAction(locals.user, 'footer:manage', locals.log);
    const f = await request.formData();
    await setFooterLegalText(String(f.get('legalText') ?? '') || null);
    audit(locals, 'saveLegalText');
    return { ok: true };
  },

  saveBranding: async ({ request, locals }) => {
    requireAction(locals.user, 'footer:manage', locals.log);
    const f = await request.formData();
    await setFooterBranding({
      showLogo: f.get('showLogo') === 'on',
      title: String(f.get('title') ?? '') || null,
      tagline: String(f.get('tagline') ?? '') || null,
      logoHeight: Number(f.get('logoHeight')),
    });
    audit(locals, 'saveBranding');
    return { ok: true };
  },
} satisfies Actions;
