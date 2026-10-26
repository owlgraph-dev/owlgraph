<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The cards before a page's editor opens, by the edit lock's phase:
  // opening, held by someone else, open in another tab, moved on.
  import { Button, Spinner } from '$lib/design-system';
  import * as m from '$lib/paraglide/messages';
  import type { EditLock } from '../session/editLock.svelte';

  let {
    lock,
    isAdmin,
    readHref,
  }: {
    lock: EditLock;
    /** Admins may take over a lock someone else holds. */
    isAdmin: boolean;
    /** The page's read view. */
    readHref: string;
  } = $props();

  const holder = $derived(lock.holder);
</script>

{#if lock.phase === 'blocked'}
  <div class="lock-gate">
    <div class="lock-card">
      <h1>{m.editor_lock_blocked_title()}</h1>
      <p>
        {m.editor_lock_blocked_body({ name: holder?.lockedByName ?? m.editor_lock_blocked_someone() })}{#if holder?.stale}{' '}{m.editor_lock_blocked_stale()}{/if}
      </p>
      <div class="lock-actions">
        <Button variant="primary" onclick={() => lock.acquire()}>{m.editor_lock_retry()}</Button>
        {#if isAdmin && holder && !holder.stale}
          <Button variant="danger" onclick={lock.takeover}>{m.editor_lock_takeover()}</Button>
        {/if}
        <Button variant="ghost" href={readHref}>{m.editor_lock_view_read_only()}</Button>
      </div>
    </div>
  </div>
{:else if lock.phase === 'elsewhere'}
  <div class="lock-gate">
    <div class="lock-card">
      <h1>{m.editor_lock_elsewhere_title()}</h1>
      <p>{m.editor_lock_elsewhere_body()}</p>
      <div class="lock-actions">
        <Button variant="primary" onclick={() => lock.acquire()}>{m.editor_lock_edit_here()}</Button>
        <Button variant="ghost" href={readHref}>{m.editor_lock_view_read_only()}</Button>
      </div>
    </div>
  </div>
{:else if lock.phase === 'moved'}
  <div class="lock-gate">
    <div class="lock-card">
      <h1>{lock.lostTo === 'tab' ? m.editor_lock_moved_tab_title() : m.editor_lock_moved_other_title()}</h1>
      <p>{lock.lostTo === 'tab' ? m.editor_lock_moved_tab_body() : m.editor_lock_moved_other_body()}</p>
      <div class="lock-actions">
        <Button variant="primary" onclick={lock.editHereAgain}>{m.editor_lock_edit_here()}</Button>
        <Button variant="ghost" href={readHref}>{m.editor_lock_view_read_only()}</Button>
      </div>
    </div>
  </div>
{:else if lock.phase === 'acquiring'}
  <div class="lock-gate"><div class="lock-card"><p class="lock-opening"><Spinner size={16} />{m.editor_lock_opening()}</p></div></div>
{/if}

<style>
  .lock-gate { position: fixed; inset: 0; display: grid; place-items: center; background: var(--ds-color-bg); z-index: 1; padding: 1.5rem; }
  .lock-card { max-width: 26rem; text-align: center; background: var(--ds-color-raised); border: 1px solid var(--ds-color-border); border-radius: var(--ds-radius-lg); padding: 2rem 1.75rem; box-shadow: var(--ds-shadow-md); }
  .lock-card h1 { font-size: var(--ds-text-lg); margin: 0 0 0.5rem; }
  .lock-card p { color: var(--ds-color-muted); font-size: var(--ds-text-md); line-height: 1.5; margin: 0 0 1.25rem; }
  .lock-card .lock-opening { display: inline-flex; align-items: center; gap: var(--ds-space-sm); margin: 0; }
  .lock-actions { display: flex; flex-wrap: wrap; gap: var(--ds-space-sm); justify-content: center; }
</style>
