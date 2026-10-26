<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Remounted per open with a snapshot of the members, like every admin
  // modal (docs/architecture/design-system/patterns.md#settings-pages).
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import { Dialog, Button, EmptyState, Checkbox } from '$lib/design-system';
  import * as m from '$lib/paraglide/messages';

  let {
    open,
    onOpenChange,
    namespace,
    users,
    members,
    onSaved,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    namespace: { id: string; name: string };
    users: { id: string; name: string; email: string }[];
    members: string[];
    onSaved: () => void;
  } = $props();

  const formId = 'namespace-members-form';
  let draft = $state<string[]>(untrack(() => [...members]));

  function toggle(userId: string) {
    draft = draft.includes(userId) ? draft.filter((id) => id !== userId) : [...draft, userId];
  }
</script>

<Dialog {open} {onOpenChange} size="md" title={m.settings_namespaces_members_heading({ name: namespace.name })} description={m.settings_namespaces_members_hint()}>
  <form
    id={formId}
    method="POST"
    action="?/setMembers"
    use:enhance={() => async ({ update }) => {
      await update();
      onSaved();
    }}
  >
    <input type="hidden" name="id" value={namespace.id} />
    {#if users.length === 0}
      <EmptyState size="sm">{m.settings_namespaces_members_no_users()}</EmptyState>
    {:else}
      <ul class="members-list">
        {#each users as u (u.id)}
          <li>
            <Checkbox size="sm" name="members" value={u.id} checked={draft.includes(u.id)} onCheckedChange={() => toggle(u.id)}>{u.name || u.email}</Checkbox>
          </li>
        {/each}
      </ul>
    {/if}
  </form>

  {#snippet footer()}
    <Button type="button" onclick={() => onOpenChange(false)}>{m.settings_cancel()}</Button>
    <Button type="submit" form={formId} variant="primary" disabled={users.length === 0}>{m.settings_namespaces_members_save()}</Button>
  {/snippet}
</Dialog>

<style>
  .members-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
    gap: 0.15rem var(--ds-space-sm);
  }
</style>
