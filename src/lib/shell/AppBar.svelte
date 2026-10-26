<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import { page } from '$app/stores';
  import Icon from '$lib/design-system/Icon.svelte';
  import { Logo } from '$lib/features/site/components';
  import { SearchTrigger } from '$lib/features/search/components';
  import CreateButton from './appbar/CreateButton.svelte';
  import { createDialog } from './appbar/createDialog.svelte';
  import PageActions from './appbar/PageActions.svelte';
  import AccountMenu from './appbar/AccountMenu.svelte';
  import { NavigationMenu, Button } from '$lib/design-system';
  import * as m from '$lib/paraglide/messages';
  import type { NavMenuItem } from '$lib/design-system/NavigationMenu.svelte';
  import { canEdit as computeCanEdit } from '$lib/features/auth';
  import type { ResolvedTreeNode } from '$lib/features/site';
  import type { SessionUser } from '$lib/features/auth';
  import { nodePath } from '$lib/features/nodes';

  let {
    user,
    navEntries = [],
    connectionsOffered = false,
    reloadLinks = false,
  }: {
    user: (SessionUser & { avatarVersion: string | null }) | null;
    navEntries?: ResolvedTreeNode[];
    /** The account menu offers Connections. */
    connectionsOffered?: boolean;
    /** Every link in the bar is a full navigation. */
    reloadLinks?: boolean;
  } = $props();

  const userCanEdit = $derived(computeCanEdit(user));

  let menuOpen = $state(false);

  const path = $derived($page.url.pathname);

  const navMenuItems = $derived<NavMenuItem[]>(
    navEntries.map((entry) =>
      entry.kind === 'link'
        ? { ...entry, active: !entry.external && path === entry.href }
        : { ...entry, children: entry.children.map((child) => ({ ...child, active: !child.external && path === child.href })) }
    )
  );

  // Edit follows /[slug]'s `canEdit` in $page.data, this node's write
  // permission; userCanEdit is role-only and looser. onPageView stays
  // page-only: it also gates the page-only local-graph toggle.
  const onPageView = $derived($page.route.id === '/[[namespace=namespace]]/[slug]' && $page.data.kind === 'page');
  const onDocumentView = $derived($page.route.id === '/[[namespace=namespace]]/[slug]' && ($page.data.kind === 'document' || $page.data.kind === 'collection'));
  const pageCanEdit = $derived((onPageView || onDocumentView) && !!$page.data.canEdit);
  const pageEditHref = $derived((onPageView || onDocumentView) ? nodePath($page.params.namespace, $page.params.slug ?? '', { edit: true }) : null);
</script>

<!-- On a route under the looser style-src every link out of the bar is a full
     navigation: a policy belongs to the document (platform/cspRoutes.ts). -->
<nav class="appbar" aria-label={m.appbar_nav_aria()} data-sveltekit-reload={reloadLinks ? '' : undefined}>
  <Logo />
  <div class="spacer"></div>
  <div class="nav-links">
    <NavigationMenu items={navMenuItems} />
  </div>
  <div class="right-cluster">
    <PageActions canEdit={pageCanEdit} href={pageEditHref} />
    <CreateButton canEdit={userCanEdit} open={createDialog.open} onOpenChange={(v) => (createDialog.open = v)} />
    <SearchTrigger />
    <AccountMenu
      {user}
      {navEntries}
      {connectionsOffered}
      {reloadLinks}
      canEdit={userCanEdit}
      open={menuOpen}
      onOpenChange={(v) => (menuOpen = v)}
      onCreateClick={() => (createDialog.open = true)}
      pageEditCanEdit={pageCanEdit}
      pageEditHref={pageEditHref}
      {onPageView}
    />
  </div>
  <span class="menu-btn">
    <Button variant="ghost" size="lg" icon active={menuOpen} onclick={() => (menuOpen = !menuOpen)} aria-label={m.account_menu_menu_aria()} title={m.account_menu_menu_aria()} aria-expanded={menuOpen}><Icon name="menu" /></Button>
  </span>
</nav>

<style>
  .appbar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: var(--appbar-top-h);
    z-index: 100;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0 1rem;
    /* The bar re-points the interface tokens on itself, so its controls read
       on a branded background unaware; unbranded, each resolves to the page's
       token. A floating layer portals to the body and keeps the page's colours. */
    background: var(--ds-appbar-bg);
    /* For whatever draws in currentColor (the icons). */
    color: var(--ds-appbar-fg);
    border-bottom: 1px solid var(--ds-appbar-border);
    --ds-color-fg: var(--ds-appbar-fg);
    --ds-color-muted: var(--ds-appbar-muted);
    --ds-color-accent: var(--ds-appbar-accent);
    --ds-color-accent-soft: var(--ds-appbar-accent-soft);
    --ds-color-on-accent: var(--ds-appbar-on-accent);
    --ds-color-border: var(--ds-appbar-border);
    --ds-color-fill-hover: var(--ds-appbar-fill-hover);
    --ds-color-fill-pressed: var(--ds-appbar-fill-pressed);
    --ds-focus-ring-color: var(--ds-appbar-fg);
    --ds-logo-light-display: var(--ds-appbar-logo-light-display);
    --ds-logo-dark-display: var(--ds-appbar-logo-dark-display);
  }
  .spacer { flex: 1 1 auto; }
  .nav-links { display: flex; align-items: center; gap: 0.2rem; flex: none; }
  .right-cluster { display: flex; align-items: center; gap: 0.4rem; flex: none; }

  /* On a desktop the avatar opens the account menu instead. */
  .menu-btn { display: none; }

  /* On a phone the bar sits at the bottom: logo, search, menu. The rest folds
     into the menu sheet. */
  @media (max-width: 640px), (pointer: coarse) and (max-height: 500px) {
    .appbar {
      top: auto;
      bottom: 0;
      height: var(--appbar-h);
      justify-content: space-around;
      gap: 0;
      padding: 0 0.4rem;
      padding-bottom: env(safe-area-inset-bottom);
      border-bottom: 0;
      border-top: 1px solid var(--ds-appbar-border);
    }
    .spacer, .nav-links { display: none; }
    /* Dissolves so the search button is a direct flex child; the other
       triggers hide themselves on a phone. */
    .right-cluster { display: contents; }
    .menu-btn { display: flex; }
  }
</style>
