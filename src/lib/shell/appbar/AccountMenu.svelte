<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // A DropdownMenu on a desktop; on a phone a BottomSheet, which also holds
  // the site navigation and page actions the app bar has no room for.
  //
  // Only anonymous visitors get the language picker here: the signed-in set it
  // on /settings/profile. The settings scope themselves by permission, so the
  // role badge is context, not a gate.
  import { page } from '$app/stores';
  import { MediaQuery } from 'svelte/reactivity';
  import { DropdownMenu, DropdownMenuItem, DropdownMenuSeparator, BottomSheet, BottomSheetItem, Avatar, Badge, TriggerFace, PHONE_SHELL_MEDIA } from '$lib/design-system';
  import Icon from '$lib/design-system/Icon.svelte';
  import LocaleSwitcher from '../LocaleSwitcher.svelte';
  import PhoneNavSheet from './PhoneNavSheet.svelte';
  import * as m from '$lib/paraglide/messages';
  import { localGraphOpen } from '$lib/features/graph';
  import type { ResolvedTreeNode } from '$lib/features/site';
  import type { SessionUser, Role } from '$lib/features/auth';
  import { avatarUrl } from '$lib/features/media';

  type User = (SessionUser & { avatarVersion: string | null }) | null;

  let {
    user,
    navEntries,
    connectionsOffered = false,
    canEdit,
    open,
    onOpenChange,
    onCreateClick,
    pageEditCanEdit = false,
    pageEditHref = null,
    onPageView = false,
    reloadLinks = false,
  }: {
    user: User;
    navEntries: ResolvedTreeNode[];
    /** An integration people connect their own account to is on: link Connections. */
    connectionsOffered?: boolean;
    /** The bar's links load their page anew; the portalled sheet's nav entries
     * are outside the bar, so its data-sveltekit-reload does not reach them. */
    reloadLinks?: boolean;
    canEdit: boolean;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreateClick: () => void;
    /** The sheet's Edit (PageActions.svelte): this node's write permission, not the role-only `canEdit`. */
    pageEditCanEdit?: boolean;
    pageEditHref?: string | null;
    /** Shows the sheet's local-graph toggle (UtilitySidebarToggle.svelte), ungated. */
    onPageView?: boolean;
  } = $props();

  // The role union is closed: a new role fails the type check here until it gets a label.
  const ROLE_LABELS: Record<Role, () => string> = {
    admin: m.account_menu_role_admin,
    editor: m.account_menu_role_editor,
    viewer: m.account_menu_role_viewer,
  };

  const avatarSrc = $derived(user ? avatarUrl(user.id, user.avatarVersion) : null);
  const roleLabel = $derived(user ? ROLE_LABELS[user.role]() : '');
  const path = $derived($page.url.pathname);

  // SSR emits the desktop markup; harmless, since the menu starts closed.
  const phoneShell = new MediaQuery(PHONE_SHELL_MEDIA);

  // The logout form sits outside the portalled menu content, so it is still in
  // the DOM once the menu has closed on select.
  let logoutForm: HTMLFormElement | undefined = $state();
  function signOut() {
    logoutForm?.requestSubmit();
  }

  function close() {
    onOpenChange(false);
  }
  function closeAndCreate() {
    close();
    onCreateClick();
  }
  function closeAndToggleSidebar() {
    close();
    localGraphOpen.update((v) => !v);
  }
</script>

{#snippet identity(u: NonNullable<User>)}
  <div class="who">
    <Avatar src={avatarSrc} fallbackText={u.name || u.email} size="md" />
    <div class="who-text">
      <strong class="who-name">{u.name || u.email}</strong>
      <span class="who-email">{u.email}</span>
      <span class="who-role"><Badge tone="neutral">{roleLabel}</Badge></span>
    </div>
  </div>
{/snippet}

{#snippet itemRow(icon: string, label: string)}
  <span class="menu-item-row"><Icon name={icon} size={16} /><span>{label}</span></span>
{/snippet}

<form bind:this={logoutForm} method="POST" action="/logout" hidden></form>

{#if !phoneShell.current}
  <DropdownMenu {open} {onOpenChange} ariaLabel={m.account_menu_menu_aria()} class="account-menu-content" triggerProps={user ? undefined : { 'aria-label': m.account_menu_account_aria(), title: m.account_menu_account_aria() }}>
    {#snippet trigger()}
      {#if user}
        <span class="avatar-trigger" title={user.email} aria-label={m.account_menu_account_aria()}>
          <Avatar src={avatarSrc} fallbackText={user.name || user.email} size="sm" />
        </span>
      {:else}
        <TriggerFace variant="ghost" icon><Icon name="user" size={18} /></TriggerFace>
      {/if}
    {/snippet}

    {#if user}
      {@render identity(user)}
      <DropdownMenuSeparator />
      <!-- Full navigations: the settings run under a looser style-src than a
           page, and a policy belongs to the document (platform/cspRoutes.ts). -->
      <DropdownMenuItem href="/settings/profile" reload>{@render itemRow('user', m.account_menu_profile())}</DropdownMenuItem>
      {#if connectionsOffered}
        <DropdownMenuItem href="/settings/connections" reload>{@render itemRow('link', m.account_menu_connections())}</DropdownMenuItem>
      {/if}
      <DropdownMenuItem href="/settings" reload>{@render itemRow('settings', m.account_menu_settings())}</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="danger" onSelect={signOut}>{@render itemRow('log-out', m.account_menu_sign_out())}</DropdownMenuItem>
    {:else}
      <div class="locale-row">
        <LocaleSwitcher />
      </div>
      <DropdownMenuSeparator />
      <DropdownMenuItem href="/login">{@render itemRow('user', m.account_menu_sign_in())}</DropdownMenuItem>
    {/if}
  </DropdownMenu>
{:else}
  <BottomSheet
    {open}
    {onOpenChange}
    title={m.account_menu_menu_aria()}
  >
    {#if user}
      {@render identity(user)}
      <div class="sheet-separator"></div>
    {/if}

    <div class="menu-nav">
      <PhoneNavSheet {navEntries} {path} reload={reloadLinks} onNavigate={close} />
      {#if pageEditCanEdit && pageEditHref}
        <BottomSheetItem href={pageEditHref} data-sveltekit-reload onclick={close}>{m.appbar_page_actions_edit()}</BottomSheetItem>
      {/if}
      {#if onPageView}
        <BottomSheetItem onclick={closeAndToggleSidebar}>{$localGraphOpen ? m.utility_sidebar_hide() : m.utility_sidebar_show()}</BottomSheetItem>
      {/if}
      {#if canEdit}
        <BottomSheetItem onclick={closeAndCreate}>{m.account_menu_create()}</BottomSheetItem>
      {/if}
    </div>
    <div class="sheet-separator"></div>

    {#if user}
      <BottomSheetItem href="/settings/profile" data-sveltekit-reload onclick={close}>{@render itemRow('user', m.account_menu_profile())}</BottomSheetItem>
      {#if connectionsOffered}
        <BottomSheetItem href="/settings/connections" data-sveltekit-reload onclick={close}>{@render itemRow('link', m.account_menu_connections())}</BottomSheetItem>
      {/if}
      <BottomSheetItem href="/settings" data-sveltekit-reload onclick={close}>{@render itemRow('settings', m.account_menu_settings())}</BottomSheetItem>
      <div class="sheet-separator"></div>
      <BottomSheetItem variant="danger" onclick={signOut}>{@render itemRow('log-out', m.account_menu_sign_out())}</BottomSheetItem>
    {:else}
      <div class="locale-row">
        <LocaleSwitcher />
      </div>
      <div class="sheet-separator"></div>
      <BottomSheetItem href="/login" onclick={close}>{@render itemRow('user', m.account_menu_sign_in())}</BottomSheetItem>
    {/if}
  </BottomSheet>
{/if}

<style>
  .avatar-trigger {
    display: inline-flex;
  }

  .locale-row { padding: 0.3rem 0.55rem; }
  .menu-nav { display: flex; flex-direction: column; }

  /* Each menu-owning file keeps its own copy: the design system styles the
     item, not its content. */
  .menu-item-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  /* The sheet has no DropdownMenu root for a DropdownMenuSeparator. */
  .sheet-separator {
    height: 1px;
    background: var(--ds-color-border);
    margin: 0.3rem 0;
  }

  .who {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.5rem 0.55rem 0.6rem;
    margin-bottom: 0.3rem;
    font-family: var(--ds-font-sans);
  }
  .who-text {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    min-width: 0;
  }
  .who-name {
    font-size: var(--ds-text-md);
    color: var(--ds-color-fg);
    overflow-wrap: anywhere;
  }
  .who-email {
    font-size: var(--ds-text-sm);
    color: var(--ds-color-muted);
    overflow-wrap: anywhere;
  }
  .who-role {
    display: inline-flex;
    align-self: flex-start;
    margin-top: 0.2rem;
  }
</style>
