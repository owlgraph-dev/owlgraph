<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { Dialog, Button, Alert, EmptyState, Checkbox, Select, Input, toast } from '$lib/design-system';
  import { formatDate } from '$lib/platform/i18n/format';
  import * as m from '$lib/paraglide/messages';

  let {
    open,
    visibility,
    namespaceAccessLevel,
    namespaceMembers = [],
    shares = [],
    users = [],
    shareLinks = [],
    onCreateShareLink,
    onRevokeShareLink,
    namespaceId,
    namespaces = [],
    onSetVisibility,
    onSetShares,
    onSetNamespace,
    shareList = true,
    shareLinkSection = true,
    onClose,
  }: {
    open: boolean;
    // As stored: null inherits the namespace's access level, live.
    visibility: string | null;
    // What "inherit" means here.
    namespaceAccessLevel: string;
    // Read-only context; membership is managed at /settings/namespaces.
    namespaceMembers?: { id: string; name: string; email: string }[];
    shares?: string[];
    users?: { id: string; name: string; email: string }[];
    // Share links widen access past the visibility, so they show whatever it is.
    shareLinks?: { id: string; label: string; createdAt: string }[];
    onCreateShareLink?: (label: string) => Promise<{ ok: boolean; id?: string; token?: string; label?: string; createdAt?: string; error?: string } | undefined>;
    onRevokeShareLink?: (id: string) => Promise<{ ok: boolean } | undefined>;
    namespaceId?: string;
    namespaces?: { id: string; name: string; slug: string | null; isDefault: boolean }[];
    onSetVisibility?: (visibility: string | null) => Promise<{ ok: boolean; visibility?: string | null } | undefined>;
    onSetShares?: (shares: string[]) => Promise<{ ok: boolean; shares?: string[] } | undefined>;
    onSetNamespace?: (namespaceId: string) => Promise<{ ok: boolean; error?: string } | undefined>;
    // Off for a node kind without a share list (a collection) or share links.
    shareList?: boolean;
    shareLinkSection?: boolean;
    onClose: () => void;
  } = $props();

  // Inherit, or an override never wider than the namespace; the server refuses
  // a wider one too. 'public' is never an override, and 'inherit' stands for null.
  const VISIBILITY_RANK: Record<string, number> = { public: 0, internal: 1, restricted: 2 };
  function widerThanNamespace(level: string): boolean {
    return VISIBILITY_RANK[level] < VISIBILITY_RANK[namespaceAccessLevel];
  }
  // A stored 'public' amounts to the namespace's level at best.
  function choiceOf(stored: string | null): string {
    return stored === null || stored === 'public' ? 'inherit' : stored;
  }
  function levelLabel(level: string): string {
    if (level === 'public') return m.editor_access_control_level_public();
    if (level === 'internal') return m.editor_access_control_level_internal();
    return m.editor_access_control_level_restricted();
  }

  let draftVisibility = $state(untrack(() => choiceOf(visibility)));
  let draftShares = $state<string[]>(untrack(() => [...shares]));
  let draftNamespaceId = $state(untrack(() => namespaceId));
  let busy = $state(false);
  let error = $state<string | null>(null);

  // Share links act immediately, not on apply(): a revealed token can't be
  // cancelled by closing the dialog. linksVal mirrors each response.
  let linksVal = $state<{ id: string; label: string; createdAt: string }[]>(untrack(() => [...shareLinks]));
  let newLinkLabel = $state('');
  let creatingLink = $state(false);
  let revokingLinkId = $state<string | null>(null);
  let createdReveal = $state<{ id: string; token: string; label: string } | null>(null);
  let linkError = $state<string | null>(null);
  let copied = $state(false);

  // Reopened, the panel keeps its mirror unless the route handed in another list.
  let seededLinks = untrack(() => shareLinks);

  // The panel stays mounted, so the drafts re-seed on each open, and only then:
  // a reload while open touches neither a draft nor a one-time reveal.
  $effect(() => {
    if (!open) return;
    untrack(() => {
      draftVisibility = choiceOf(visibility);
      draftShares = [...shares];
      draftNamespaceId = namespaceId;
      error = null;
      if (shareLinks !== seededLinks) {
        linksVal = [...shareLinks];
        seededLinks = shareLinks;
      }
      createdReveal = null;
      linkError = null;
      newLinkLabel = '';
    });
  });

  function shareUrl(token: string): string {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/share/${token}`;
  }

  async function createLink() {
    creatingLink = true;
    linkError = null;
    const res = await onCreateShareLink?.(newLinkLabel);
    creatingLink = false;
    if (!res?.ok || !res.token || !res.id) {
      linkError = m.editor_access_control_error_share_link_create();
      return;
    }
    linksVal = [{ id: res.id, label: res.label ?? newLinkLabel, createdAt: res.createdAt ?? new Date().toISOString() }, ...linksVal];
    createdReveal = { id: res.id, token: res.token, label: res.label ?? newLinkLabel };
    newLinkLabel = '';
  }

  async function revokeLink(id: string) {
    if (!confirm(m.editor_access_control_share_link_revoke_confirm())) return;
    revokingLinkId = id;
    const res = await onRevokeShareLink?.(id);
    revokingLinkId = null;
    if (!res?.ok) {
      linkError = m.editor_access_control_error_share_link_revoke();
      return;
    }
    linksVal = linksVal.filter((l) => l.id !== id);
    if (createdReveal?.id === id) createdReveal = null;
  }

  async function copyLink(token: string) {
    try {
      await navigator.clipboard.writeText(shareUrl(token));
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      // The link stays visible to copy by hand. A toast, not the link Alert:
      // nothing about the link went wrong.
      toast.error(m.editor_access_control_error_share_link_copy());
    }
  }

  function toggleDraftShare(id: string) {
    draftShares = draftShares.includes(id) ? draftShares.filter((s) => s !== id) : [...draftShares, id];
  }

  function discard() {
    if (busy) return;
    onClose();
  }

  async function apply() {
    busy = true;
    error = null;
    const visChanged = draftVisibility !== choiceOf(visibility);
    const sharesChanged = JSON.stringify(draftShares) !== JSON.stringify(shares);
    const namespaceChanged = draftNamespaceId !== undefined && draftNamespaceId !== namespaceId;
    try {
      // Sequential: both PATCH the same record and shares only matter once it is
      // restricted. Namespace last: the caller may navigate to the new URL.
      if (visChanged) {
        const r = await onSetVisibility?.(draftVisibility === 'inherit' ? null : draftVisibility);
        if (!r?.ok) { error = m.editor_access_control_error_visibility(); busy = false; return; }
      }
      if (sharesChanged) {
        const r = await onSetShares?.(draftShares);
        if (!r?.ok) { error = m.editor_access_control_error_shares(); busy = false; return; }
      }
      if (namespaceChanged) {
        const r = await onSetNamespace?.(draftNamespaceId!);
        if (!r?.ok) { error = r?.error ?? m.editor_access_control_error_namespace(); busy = false; return; }
      }
      busy = false;
      onClose();
    } catch {
      busy = false;
      error = m.editor_access_control_error_generic();
    }
  }
</script>

<Dialog
  {open}
  onOpenChange={(o) => { if (!o) discard(); }}
  size="md"
  title={m.editor_access_control_title()}
>
  <p class="prop-label">{m.editor_access_control_who_can_view()}</p>
  <Select
    size="sm"
    width="full"
    ariaLabel={m.editor_access_control_who_can_view()}
    items={[
      { value: 'inherit', label: m.editor_access_control_visibility_inherit_option({ level: levelLabel(namespaceAccessLevel) }) },
      { value: 'internal', label: m.editor_access_control_visibility_internal_option(), disabled: widerThanNamespace('internal') },
      { value: 'restricted', label: m.editor_access_control_visibility_restricted_option() },
    ]}
    value={draftVisibility}
    onValueChange={(v) => (draftVisibility = v)}
  />
  {#if draftVisibility === 'inherit'}
    <p class="prop-hint">{m.editor_access_control_inherit_hint()}</p>
  {/if}
  {#if namespaceAccessLevel !== 'public'}
    <p class="prop-hint">{m.editor_access_control_public_needs_namespace()}</p>
  {/if}
  {#if draftVisibility === 'inherit' && namespaceAccessLevel === 'restricted'}
    <p class="prop-label">{m.editor_access_control_namespace_members_label()}</p>
    {#if namespaceMembers.length === 0}
      <div class="ac-empty"><EmptyState size="sm">{m.editor_access_control_namespace_members_none()}</EmptyState></div>
    {:else}
      <ul class="member-list">
        {#each namespaceMembers as nm (nm.id)}
          <li>{nm.name || nm.email}</li>
        {/each}
      </ul>
    {/if}
  {/if}
  {#if draftVisibility === 'restricted' && !shareList}
    <p class="prop-hint">{m.editor_access_control_restricted_owner_only()}</p>
  {:else if draftVisibility === 'restricted'}
    <p class="prop-hint">{m.editor_access_control_restricted_hint()}</p>
    {#if users.length === 0}
      <div class="ac-empty"><EmptyState size="sm">{m.editor_access_control_no_other_users()}</EmptyState></div>
    {:else}
      <ul class="share-list">
        {#each users as u (u.id)}
          <li>
            <Checkbox size="sm" checked={draftShares.includes(u.id)} onCheckedChange={() => toggleDraftShare(u.id)}>
              <span class="share-name">{u.name || u.email}</span>
              {#if u.name}<span class="share-email">{u.email}</span>{/if}
            </Checkbox>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
  {#if namespaces.length > 0}
    <p class="prop-label">{m.editor_access_control_namespace_label()}</p>
    <Select
      size="sm"
      width="full"
      ariaLabel={m.editor_access_control_namespace_label()}
      items={namespaces.map((ns) => ({ value: ns.id, label: ns.isDefault ? m.editor_access_control_namespace_default_option() : ns.name }))}
      value={draftNamespaceId ?? ''}
      onValueChange={(v) => (draftNamespaceId = v)}
    />
    <p class="prop-hint">{m.editor_access_control_namespace_hint()}</p>
  {/if}
  {#if error}<div class="ac-alert"><Alert tone="danger">{error}</Alert></div>{/if}

  {#if shareLinkSection}
  <div class="share-links-section">
    <p class="prop-label">{m.editor_access_control_share_links_heading()}</p>
    {#if linksVal.length === 0}
      <div class="ac-empty"><EmptyState size="sm">{m.editor_access_control_share_links_empty()}</EmptyState></div>
    {:else}
      <ul class="link-list">
        {#each linksVal as link (link.id)}
          <li>
            <div class="link-info">
              <span class="link-label">{link.label || m.editor_access_control_share_link_untitled()}</span>
              <span class="link-date">{formatDate(link.createdAt)}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onclick={() => revokeLink(link.id)}
              disabled={revokingLinkId === link.id}
            >{m.editor_access_control_share_link_revoke()}</Button>
          </li>
        {/each}
      </ul>
    {/if}

    {#if createdReveal}
      <div class="ac-alert">
      <Alert tone="success">
        {m.editor_access_control_share_link_created_hint()}
        <div class="link-reveal-row">
          <span class="link-grow"><Input size="sm" readonly value={shareUrl(createdReveal.token)} aria-label={m.editor_access_control_share_links_heading()} onclick={(e: MouseEvent) => (e.currentTarget as HTMLInputElement).select()} /></span>
          <Button variant="secondary" size="sm" onclick={() => copyLink(createdReveal!.token)}>
            {copied ? m.editor_access_control_share_link_copied() : m.editor_access_control_share_link_copy()}
          </Button>
        </div>
      </Alert>
      </div>
    {/if}

    <div class="link-create-row">
      <span class="link-grow">
        <Input
          size="sm"
          placeholder={m.editor_access_control_share_link_label_placeholder()}
          aria-label={m.editor_access_control_share_link_label_placeholder()}
          value={newLinkLabel}
          onchange={(e: Event) => (newLinkLabel = (e.currentTarget as HTMLInputElement).value)}
          maxlength="120"
        />
      </span>
      <Button variant="secondary" size="sm" onclick={createLink} disabled={creatingLink}>
        {creatingLink ? m.editor_access_control_share_link_creating() : m.editor_access_control_share_link_create()}
      </Button>
    </div>
    {#if linkError}<div class="ac-alert"><Alert tone="danger">{linkError}</Alert></div>{/if}
  </div>
  {/if}

  {#snippet footer()}
    <Button variant="secondary" onclick={discard} disabled={busy}>{m.editor_access_control_cancel()}</Button>
    <Button variant="primary" onclick={apply} disabled={busy}>{busy ? m.editor_access_control_saving() : m.editor_access_control_apply()}</Button>
  {/snippet}
</Dialog>

<style>
  .prop-label { font-size: 0.78rem; color: var(--ds-color-muted); margin: 0 0 0.4rem; }
  .prop-hint { font-size: var(--ds-text-xs); color: var(--ds-color-muted); margin: 0.5rem 0 0; }
  .ac-empty { margin: 0.5rem 0 0; }
  .share-list { list-style: none; padding: 0; margin: 0.4rem 0 0; display: flex; flex-direction: column; gap: 0.1rem; max-height: 12rem; overflow-y: auto; }
  .member-list { list-style: none; padding: 0; margin: 0.3rem 0 0.6rem; display: flex; flex-direction: column; gap: 0.1rem; max-height: 8rem; overflow-y: auto; font-size: 0.82rem; color: var(--ds-color-muted); }
  .share-email { margin-left: 0.4rem; color: var(--ds-color-muted); font-size: var(--ds-text-xs); }
  .share-links-section { margin-top: 1rem; padding-top: 0.9rem; border-top: 1px solid var(--ds-color-border); }
  .link-list { list-style: none; padding: 0; margin: 0.4rem 0 0; display: flex; flex-direction: column; gap: 0.3rem; max-height: 10rem; overflow-y: auto; }
  .link-list li { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 0.2rem 0; }
  .link-info { display: flex; flex-direction: column; min-width: 0; }
  .link-label { font-size: 0.85rem; overflow-wrap: anywhere; }
  .link-date { font-size: var(--ds-text-xs); color: var(--ds-color-muted); }
  .link-reveal-row { display: flex; gap: 0.4rem; margin-top: 0.3rem; }
  .link-create-row { display: flex; gap: 0.4rem; margin-top: 0.6rem; }
  .link-grow { flex: 1; min-width: 0; }
  .ac-alert { margin-top: 0.7rem; }
</style>
