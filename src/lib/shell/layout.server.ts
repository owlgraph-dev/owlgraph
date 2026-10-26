// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The root layout's route adapter (src/routes/+layout.server.ts): it may import
// @sveltejs/kit, and only src/routes/ may import it.
import { resolveTreeForUser } from '$lib/features/site/server';
import { getCurrentLogo, getUiFontFamily, getSiteTheme, customStylesHref, listCustomStyleRefs } from '$lib/features/site/server';
import { resolveFooterForUser } from '$lib/features/site/server';
import { getUserAvatarMeta } from '$lib/features/media/server';
import { listNamespacesForUser } from '$lib/features/namespaces/server';
import { connectionsOffered } from '$lib/features/pluginHost/server';
import { getFontFaceCss, getCustomFontEntries } from '$lib/features/content/server';
import { getParagraphStyles } from '$lib/features/content/server';
import { resolveFontStack, customFontStacksRecord, StyleCollector } from '$lib/features/content';
import { siteLocaleConfig } from '$lib/platform/i18n/siteLocales';
import type { ServerLoadEvent } from '@sveltejs/kit';

export const load = async ({ locals }: ServerLoadEvent) => {
  const logo = await getCurrentLogo();
  // Here, not on SessionUser: that would cost every authenticated request
  // (API, GraphQL, MCP), not just the ones that render it.
  const avatar = locals.user ? await getUserAvatarMeta(locals.user.id) : null;
  // Viewer-scoped: only the namespaces this viewer may see. +layout.ts also
  // feeds them to the browser's [namespace] matcher (docs/architecture/routing.md).
  const namespaces = (await listNamespacesForUser(locals.user)).map((n) => ({ id: n.id, name: n.name, slug: n.slug, isDefault: n.is_default }));
  const [customFonts, paragraphStyles, uiFontFamily, siteTheme, stylesHref, customStyles, footer, offered] = await Promise.all([
    getCustomFontEntries(),
    getParagraphStyles(),
    getUiFontFamily(),
    getSiteTheme(),
    customStylesHref(),
    listCustomStyleRefs(),
    resolveFooterForUser(locals.user),
    locals.user ? connectionsOffered() : false,
  ]);
  // Chrome values from site data (the footer logo's height) go in a per-page
  // stylesheet under this response's nonce: the elements carry `data-b`, never
  // a style attribute (content/capabilities/pageStyles.ts).
  const shell = new StyleCollector();
  const footerLogoRuleId = footer.branding ? shell.add({ height: `${footer.branding.logoHeight}px` }) : '';
  return {
    user: locals.user ? { ...locals.user, avatarVersion: avatar?.id ?? null } : null,
    // docs/architecture/plugins.md, "Connections".
    connectionsOffered: offered,
    navEntries: await resolveTreeForUser('nav', locals.user),
    logoUrl: logo ? `/api/media/branding/logo/${logo.id}` : null,
    // Sparse as stored: the root layout compiles it the same on the server and
    // in the browser, cached per version.
    theme: siteTheme.theme,
    themeVersion: siteTheme.version,
    logoDarkUrl: siteTheme.theme.logoDarkAssetId ? `/api/media/branding/logo/${siteTheme.theme.logoDarkAssetId}` : null,
    footer,
    footerLogoRuleId,
    shellCss: shell.css(),
    namespaces,
    fontFaceCss: await getFontFaceCss(),
    customFonts,
    paragraphStyles,
    // The interface font (--ds-font-sans), a setting apart from the content's
    // body font. Undefined keeps the app.css default.
    uiFontStack: resolveFontStack(uiFontFamily, customFontStacksRecord(customFonts)),
    colorPref: locals.colorPref,
    // As the hooks resolved them; +layout.ts hands them to the browser's copy
    // (docs/architecture/languages.md).
    siteLocales: siteLocaleConfig(),
    // This response's style-src nonce (platform/csp.ts), on every <style> a
    // component renders. In the browser, styleNonceFor keeps the document's
    // own nonce across re-runs of this load.
    styleNonce: locals.styleNonce,
    // A link, not inline CSS: one content-hashed artifact every surface shares,
    // so authored content looks the same in all (docs/architecture/custom-styles.md).
    customStylesHref: stylesHref,
    // The same styles as data for the editor's mark and picker, from the
    // artifact cache the href already filled.
    customStyles,
  };
};
