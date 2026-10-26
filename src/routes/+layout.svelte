<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import '../app.css';
  import { onMount, tick, untrack } from 'svelte';
  import { beforeNavigate } from '$app/navigation';
  import { page } from '$app/stores';
  import AppBar from '$lib/shell/AppBar.svelte';
  import { Footer } from '$lib/features/site/components';
  import { LocalGraph } from '$lib/features/graph/components';
  import UtilitySidebarToggle from '$lib/shell/UtilitySidebarToggle.svelte';
  import { SearchOverlay } from '$lib/features/search/components';
  import { localGraphOpen, localGraphWidth } from '$lib/features/graph';
  import { searchOverlayOpen } from '$lib/features/search';
  import { setTypographyRegistry, setBrandColors, setCustomStyles, setBlockDefaults, compileContentTheme, customFontStacksRecord, canvasScheme, CONTENT_SCHEME_FALLBACK } from '$lib/features/content';
  import { Toaster, trackKeyboardInset } from '$lib/design-system';
  import { compileTheme, setActiveTheme } from '$lib/design-system/theme/siteTheme';
  import { appbarColors, themeColors } from '$lib/design-system/theme/preference';
  import { styleNonceFor } from '$lib/platform/styleNonce';
  import { crossesStylePolicy } from '$lib/platform/csp';
  import { styleRouteKind, MERMAID_FRAME_ROUTE } from '$lib/platform/cspRoutes';
  import * as m from '$lib/paraglide/messages';
  let { children, data } = $props();

  // Marks the document once it answers input, after the effects pending at
  // mount have run; tooling waits on it (tests/e2e/fixtures.ts).
  onMount(() => {
    tick().then(() => (document.documentElement.dataset.hydrated = ''));
    return trackKeyboardInset();
  });

  // A style policy belongs to the document (platform/cspRoutes.ts): under the
  // looser style-src the app bar's links leave with a full navigation.
  const looseStyleRoute = $derived(styleRouteKind($page.route.id) === 'loose');

  // So does any other client navigation into the other policy's routes.
  beforeNavigate((navigation) => {
    const to = navigation.to?.url;
    if (navigation.willUnload || !to || to.origin !== location.origin) return;
    if (navigation.type !== 'link' && navigation.type !== 'goto') return;
    if (!crossesStylePolicy(location.pathname, to.pathname)) return;
    navigation.cancel();
    location.assign(to.href);
  });

  // Read through styleNonceFor, never straight from data: a re-run of the
  // layout load brings a nonce the document's policy has never seen. (No tag
  // name here: inside this script it would be taken for a style block.)
  const styleNonce = $derived(styleNonceFor(data.styleNonce));

  // The <title> below is the default for routes without their own. It lives
  // here, not in app.html, where it would precede SvelteKit's head markup and
  // win over a route's title. (A script comment: app.html warns about head comments.)

  // Cached per version; in the browser also what contrast guidance resolves
  // against and what the colour pickers offer.
  const siteTheme = $derived(compileTheme(data.theme, data.themeVersion));
  // The capability defaults as CSS (docs/architecture/blocks/capabilities.md), and the resolved defaults
  // the editor's emitters and block settings panel read.
  const contentTheme = $derived(
    compileContentTheme(data.theme, data.themeVersion, { customStacks: customFontStacksRecord(data.customFonts), paragraphStyles: data.paragraphStyles })
  );
  // Set before any page below reads them, since Tiptap's renderHTML reads the
  // custom styles and the typography registry as the editor mounts, before any
  // effect runs; and again when the layout's data changes.
  setActiveTheme(untrack(() => siteTheme));
  setBlockDefaults(untrack(() => contentTheme.blockDefaults));
  setBrandColors(untrack(() => data.theme?.brand));
  setCustomStyles(untrack(() => data.customStyles));
  setTypographyRegistry(untrack(() => data.customFonts), untrack(() => data.paragraphStyles));
  $effect.pre(() => {
    setActiveTheme(siteTheme);
    setBlockDefaults(contentTheme.blockDefaults);
    setBrandColors(data.theme?.brand);
    setCustomStyles(data.customStyles);
    setTypographyRegistry(data.customFonts, data.paragraphStyles);
  });

  // Cmd/Ctrl-K opens search everywhere, the editor included, where no app bar
  // renders; preventDefault overrides Firefox's own Ctrl+K.
  function onGlobalKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      searchOverlayOpen.set(true);
    }
  }

  // Page and document reads share a route id, so the page chrome keys off
  // data.kind; a share link reads onto the same shape.
  const isPageRead = $derived(
    ($page.route.id === '/[[namespace=namespace]]/[slug]' || $page.route.id === '/share/[id]') &&
      $page.data.kind === 'page'
  );
  // On a phone the panel overlays the page, and the CSS zeroes the reflow.
  const reflow = $derived($localGraphOpen && isPageRead);
  // The panel renders here, not inside <main>: main takes the page's content
  // scheme, which would leave the panel light in a dark app.
  const localGraph = $derived(isPageRead ? ($page.data.localGraph as { nodes: []; edges: []; focusId: string | null } | undefined) : undefined);
  // A share link shows the panel but offers no tab.
  const showSidebarToggle = $derived(!!localGraph && $page.route.id === '/[[namespace=namespace]]/[slug]');
  const canvasRoute = $derived(isPageRead);
  // The Mermaid render frame gets this layout's head and no chrome.
  const frameRoute = $derived($page.route.id === MERMAID_FRAME_ROUTE);
  // The editor brings its own fixed shell (DesktopEditor.svelte).
  const showAppBar = $derived($page.route.id !== '/[[namespace=namespace]]/[slug]/edit' && !frameRoute);
  // Settings and dev tooling bring their own frame and render no footer.
  const settingsRoute = $derived($page.route.id?.startsWith('/settings') ?? false);
  const devRoute = $derived($page.route.id?.startsWith('/dev/') ?? false);
  const chromeRoute = $derived(settingsRoute || devRoute);
  // A grid of results or a collection's contents widen the reading column.
  const browseRoute = $derived($page.route.id === '/search' || ($page.route.id === '/[[namespace=namespace]]/[slug]' && $page.data.kind === 'collection'));
</script>

<svelte:head>
  <title>owlgraph</title>
  <!-- The scheme tokens (docs/architecture/theming.md), in the server-rendered head so they
       exist before first paint. -->
  {@html `<style nonce="${styleNonce}">${siteTheme.css}${contentTheme.css}</style>`}
  <!-- One per device scheme; applyColorPref updates both. -->
  <meta name="theme-color" media="(prefers-color-scheme: light)" content={themeColors(data.colorPref, appbarColors()).light} />
  <meta name="theme-color" media="(prefers-color-scheme: dark)" content={themeColors(data.colorPref, appbarColors()).dark} />
  <!-- --ds-font-sans's default is an @property initial-value (app.css), so this
       override always wins, whatever the load order. -->
  {#if data.fontFaceCss || data.uiFontStack}{@html `<style nonce="${styleNonce}">${data.fontFaceCss}${data.uiFontStack ? `:root{--ds-font-sans:${data.uiFontStack}}` : ''}</style>`}{/if}
  <!-- The custom styles (docs/architecture/custom-styles.md), after the tokens they read. A
       same-origin link satisfies style-src 'self', caches forever by its
       content hash, and serves the reader, share and editor alike. -->
  {#if data.customStylesHref}<link rel="stylesheet" href={data.customStylesHref} />{/if}
  <!-- The shell's per-page rules: unlayered, like a page's own
       (content/capabilities/pageStyles.ts). -->
  {#if data.shellCss}{@html `<style nonce="${styleNonce}">${data.shellCss}</style>`}{/if}
</svelte:head>

{#if showAppBar}
  <AppBar user={data.user ?? null} navEntries={data.navEntries} connectionsOffered={data.connectionsOffered} reloadLinks={looseStyleRoute} />
{/if}

<svelte:window onkeydown={onGlobalKeydown} />
{#if !frameRoute}
  <SearchOverlay />
{/if}

{#if showSidebarToggle}
  <UtilitySidebarToggle />
{/if}
{#if localGraph}
  <LocalGraph nodes={localGraph.nodes} edges={localGraph.edges} focusId={localGraph.focusId} />
{/if}

{#if frameRoute}
  {@render children()}
{:else}
<div class="page-shell">
  <!-- Undefined until the panel opens, so the server renders no style
       attribute under the reader's strict style-src (platform/csp.ts). -->
  <div class="content" class:with-bar={showAppBar} style:--lg-pad={reflow ? `${$localGraphWidth}px` : undefined}>
    <main class:canvas-route={canvasRoute} class:settings-route={chromeRoute} class:browse-route={browseRoute} data-scheme={canvasRoute ? canvasScheme($page.data.contentScheme ?? CONTENT_SCHEME_FALLBACK) : undefined} data-b={(canvasRoute && $page.data.groundRuleId) || undefined}>
      {@render children()}
    </main>

    <!-- Rendered configured or not: its info icon is the offer of the source
         code (AGPL-3.0 §13, /-/about), which no setting removes. -->
    {#if showAppBar && !chromeRoute}
      <Footer footer={data.footer} logoRuleId={data.footerLogoRuleId} />
    {/if}
  </div>
</div>

<!-- After the page, so its buttons come late in the tab order. -->
<Toaster
  regionLabel={m.toast_region_label()}
  closeLabel={m.toast_dismiss()}
  class={showAppBar ? 'toaster-above-appbar' : 'toaster-above-editor-bar'}
/>
{/if}

<style>
  /* The toasts' clearance above a phone's bottom bar: the app bar, or the
     phone editor's toolbar (PhoneToolbar.svelte). Classes, so the value
     never rides a style attribute. */
  :global(.toaster-above-appbar) { --ds-toaster-phone-bottom: calc(var(--appbar-h) + env(safe-area-inset-bottom, 0px)); }
  :global(.toaster-above-editor-bar) { --ds-toaster-phone-bottom: calc(3.5rem + env(safe-area-inset-bottom, 0px)); }

  /* The document is the app's scroller (docs/architecture/responsive.md, "What scrolls"):
     SvelteKit restores the window's scroll and no other, and a scroll box in
     this layout would keep its position through every navigation. What stays
     put is position: fixed. */
  .page-shell {
    /* vw is the phone's width from the first layout, so the canvas is never
       styled, or its background fetched, at a desktop's width (docs/architecture/media.md). */
    max-width: 100vw;
    min-height: 100vh;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    background: var(--ds-color-bg);
  }
  /* Grows, and main in it, so a short page still pushes the footer down; the
     padding-right reflows the page beside the local-graph panel. */
  .content {
    flex: 1 0 auto;
    display: flex;
    flex-direction: column;
    padding-right: var(--lg-pad, 0);
  }

  .content.with-bar { margin-top: var(--appbar-top-h); }
  /* main sizes to its content as a column-flex item with auto margins: the
     100% cap keeps one long word from widening it past a phone's screen. */
  main { flex: 1 0 auto; max-width: min(var(--ds-width-reading), 100%); margin: 0 auto; padding: 3rem 1.25rem 6rem; overflow-wrap: break-word; }
  /* An explicit width: fit-content would shrink main to the results. */
  main.browse-route { max-width: min(var(--ds-width-browse), 100%); width: 100%; box-sizing: border-box; }
  /* main takes the page's content scheme and paints its ground down to the
     footer, with the page's own background (pageLayout.ts,
     pageGroundOverrides) when it has one, so a capped canvas leaves no seam. */
  main.canvas-route { max-width: none; margin: 0; padding: 0 0 6rem; background: var(--page-bg, var(--content-bg)); }
  /* SettingsShell owns the frame. An explicit width: fit-content would let a
     table's min-width widen main past the viewport instead of scrolling in
     its wrapper. No overflow: the sidebar is sticky against the document. */
  main.settings-route { max-width: none; width: 100%; margin: 0; padding: 0; box-sizing: border-box; }
  @media (max-width: 640px), (pointer: coarse) and (max-height: 500px) {
    .content { padding-right: 0; }
    /* The bar is at the bottom: reserve its height so the footer clears it. */
    .content.with-bar { margin-top: 0; padding-bottom: calc(var(--appbar-h) + env(safe-area-inset-bottom)); }
    main, main.canvas-route { padding-bottom: 2.5rem; }
  }
</style>
