<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import { renderPageBlocks } from '../client';
  import { onMount, untrack } from 'svelte';
  import { RenderedContent } from '$lib/features/content/components';
  import { diffDocs, type BlockPick, type BlockDiffEntry } from '../pageDiff';
  import { Button, Alert, EmptyState, Checkbox, Badge } from '$lib/design-system';
  import * as m from '$lib/paraglide/messages';

  let {
    pageId,
    current,
    draft,
    onApply,
    onDiscard,
    movedToTab = false,
  }: {
    pageId: string;
    /** The lock went to another tab of this browser, not to someone else. */
    movedToTab?: boolean;
    current: unknown;
    draft: unknown;
    // On success the caller reloads.
    onApply: (picks: BlockPick[]) => Promise<{ ok: true } | { ok: false; reason: string }>;
    onDiscard: () => void;
  } = $props();

  // current → draft surfaces this user's changes; pure reorders are skipped.
  const diff = $derived(diffDocs(current, draft));
  const changes = $derived(diff.entries.filter((e) => e.status !== 'unchanged'));

  type Row = { entry: BlockDiffEntry; oldHtml: string | null; newHtml: string | null };
  let rows = $state<Row[]>(untrack(() => changes.map((e) => ({ entry: e, oldHtml: null, newHtml: null }))));
  let rendering = $state(true);
  // A plain style element: the editor route's CSP allows inline styles.
  let previewCss = $state('');
  let canvasRuleId = $state('');

  // Additions and edits by default; a removal is opt-in.
  let selected = $state<Record<string, boolean>>(
    untrack(() => Object.fromEntries(changes.map((e) => [e.blockId ?? '', e.status === 'added' || e.status === 'modified'])))
  );
  let busy = $state(false);
  let message = $state<{ text: string; tone: 'warning' | 'danger' } | null>(null);

  function label(status: string): string {
    if (status === 'added') return m.editor_reconcile_badge_added();
    if (status === 'modified') return m.editor_reconcile_badge_modified();
    return m.editor_reconcile_badge_removed();
  }

  onMount(async () => {
    const flat: { ri: number; side: 'old' | 'new'; block: unknown }[] = [];
    rows.forEach((r, ri) => {
      if (r.entry.oldBlock) flat.push({ ri, side: 'old', block: r.entry.oldBlock });
      if (r.entry.newBlock) flat.push({ ri, side: 'new', block: r.entry.newBlock });
    });
    if (!flat.length) {
      rendering = false;
      return;
    }
    try {
      const rendered = await renderPageBlocks(pageId, flat.map((f) => f.block));
      if (rendered) {
        previewCss = rendered.css;
        canvasRuleId = rendered.canvasRuleId;
        rendered.html.forEach((h: string, i: number) => {
          const f = flat[i];
          if (f.side === 'old') rows[f.ri].oldHtml = h;
          else rows[f.ri].newHtml = h;
        });
      }
    } catch {
      // Rows fall back to a text preview.
    }
    rendering = false;
  });

  // The full diff, so an added block can anchor on an unchanged neighbour.
  function buildPicks(): BlockPick[] {
    const picks: BlockPick[] = [];
    let lastPresentId: string | null = null;
    for (const e of diff.entries) {
      const id = e.blockId;
      if (!id) continue;
      const on = selected[id];
      if (e.status === 'added') {
        if (on) {
          picks.push({ blockId: id, op: 'add', block: e.newBlock, afterBlockId: lastPresentId });
          lastPresentId = id;
        }
      } else if (e.status === 'modified') {
        if (on) picks.push({ blockId: id, op: 'replace', block: e.newBlock });
        lastPresentId = id;
      } else if (e.status === 'removed') {
        if (on) picks.push({ blockId: id, op: 'remove' });
        else lastPresentId = id;
      } else {
        lastPresentId = id;
      }
    }
    return picks;
  }

  async function apply() {
    const picks = buildPicks();
    if (!picks.length) {
      message = { text: m.editor_reconcile_nothing_selected(), tone: 'warning' };
      return;
    }
    busy = true;
    message = null;
    const res = await onApply(picks);
    if (!res.ok) {
      busy = false;
      message = {
        text: res.reason === 'lock' ? m.editor_reconcile_error_lock() : res.reason === 'unknown_dropped' ? m.editor_reconcile_error_unknown() : m.editor_reconcile_error_generic(),
        tone: 'danger',
      };
    }
  }

  const fallback = (e: BlockDiffEntry) => e.preview || m.editor_reconcile_fallback({ type: e.type || 'block' });
</script>

{#if previewCss}{@html `<style>${previewCss}</style>`}{/if}
<div class="reconcile">
  <div class="panel">
    <h1>{movedToTab ? m.editor_reconcile_title_tab() : m.editor_reconcile_title()}</h1>
    <p class="sub">{m.editor_reconcile_subtitle()}</p>

    {#if changes.length === 0}
      <EmptyState>{m.editor_reconcile_none()}</EmptyState>
    {:else}
      <div class="summary">
        {m.editor_reconcile_summary({ added: diff.summary.added, modified: diff.summary.modified, removed: diff.summary.removed })}
      </div>
      <div class="cols-head"><span>{m.editor_reconcile_col_current()}</span><span>{m.editor_reconcile_col_draft()}</span></div>
      <ul class="rows">
        {#each rows as r (r.entry.blockId)}
          <li class="row {r.entry.status}">
            <div class="row-head">
              <Checkbox size="sm" bind:checked={selected[r.entry.blockId ?? '']} disabled={busy}>
                <span class="rh-badges">
                  <Badge tone={r.entry.status === 'added' ? 'success' : r.entry.status === 'modified' ? 'warning' : 'danger'}>{label(r.entry.status)}</Badge>
                  {#if r.entry.moved}<Badge>{m.editor_reconcile_moved_tag()}</Badge>{/if}
                </span>
              </Checkbox>
            </div>
            <div class="cmp scroll-cue">
              <div class="cell">
                <span class="cell-label">{m.editor_reconcile_col_current()}</span>
                {#if r.entry.oldBlock}
                  {#if r.oldHtml}<RenderedContent html={r.oldHtml} {canvasRuleId} />
                  {:else if rendering}<div class="ph muted">{m.editor_reconcile_rendering()}</div>
                  {:else}<div class="ph">{fallback(r.entry)}</div>{/if}
                {:else}<div class="ph empty">{m.editor_reconcile_not_on_current()}</div>{/if}
              </div>
              <div class="cell">
                <span class="cell-label">{m.editor_reconcile_col_draft()}</span>
                {#if r.entry.newBlock}
                  {#if r.newHtml}<RenderedContent html={r.newHtml} {canvasRuleId} />
                  {:else if rendering}<div class="ph muted">{m.editor_reconcile_rendering()}</div>
                  {:else}<div class="ph">{fallback(r.entry)}</div>{/if}
                {:else}<div class="ph empty">{m.editor_reconcile_deleted_in_draft()}</div>{/if}
              </div>
            </div>
          </li>
        {/each}
      </ul>
    {/if}

    {#if message}<div class="msg"><Alert tone={message.tone}>{message.text}</Alert></div>{/if}

    <div class="actions">
      <Button variant="primary" onclick={apply} disabled={busy || changes.length === 0}>
        {busy ? m.editor_reconcile_applying() : m.editor_reconcile_apply()}
      </Button>
      <Button variant="secondary" onclick={onDiscard} disabled={busy}>{m.editor_reconcile_discard()}</Button>
    </div>
    <p class="hint">{m.editor_reconcile_hint()}</p>
  </div>
</div>

<style>
  .reconcile { position: fixed; inset: 0; display: grid; place-items: center; background: var(--ds-color-scrim); z-index: 10; padding: 1.5rem; }
  .panel { width: min(56rem, 100%); max-height: 88vh; overflow: auto; background: var(--ds-color-raised); border: 1px solid var(--ds-color-border); border-radius: var(--ds-radius-lg); padding: 1.75rem; box-shadow: var(--ds-shadow-lg); }
  h1 { font-size: 1.15rem; margin: 0 0 0.4rem; }
  .sub { color: var(--ds-color-muted); font-size: 0.9rem; line-height: 1.5; margin: 0 0 1rem; }
  .summary { font-size: 0.8rem; color: var(--ds-color-muted); margin-bottom: 0.6rem; }

  .cols-head { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; font-size: var(--ds-text-xs); font-weight: var(--ds-weight-medium); color: var(--ds-color-muted); padding: 0 0.1rem 0.35rem; }
  .rows { list-style: none; margin: 0 0 1rem; padding: 0; display: flex; flex-direction: column; gap: 0.9rem; }
  .row { border: 1px solid var(--ds-color-border); border-radius: var(--ds-radius-md); overflow: hidden; }
  .row.added { border-left: 3px solid var(--ds-color-success); }
  .row.modified { border-left: 3px solid var(--ds-color-warning); }
  .row.removed { border-left: 3px solid var(--ds-color-danger); }
  .rh-badges { display: inline-flex; gap: 0.35rem; }
  .row-head { display: flex; align-items: center; padding: 0.45rem 0.7rem; border-bottom: 1px solid var(--ds-color-border); background: var(--ds-color-well); }

  .cmp { display: grid; grid-template-columns: 1fr 1fr; }
  .cell { min-width: 0; padding: 0.7rem 0.85rem; overflow: hidden; }
  .cell:first-child { border-right: 1px solid var(--ds-color-border); }
  .cell-label { display: none; font-size: var(--ds-text-xs); font-weight: var(--ds-weight-medium); color: var(--ds-color-muted); margin-bottom: 0.4rem; }
  .ph { color: var(--ds-color-muted); font-size: 0.85rem; }
  .ph.empty { font-style: italic; }
  .ph.muted { opacity: 0.6; }

  .msg { margin: 0 0 0.9rem; }
  .actions { display: flex; gap: 0.6rem; }
  .hint { font-size: 0.78rem; color: var(--ds-color-muted); margin: 0.85rem 0 0; line-height: 1.45; }

  /* On a phone: stack the two versions into a horizontal swipe (current -> draft). */
  /* ui-check-allow: shell-media — two versions side by side need the width, whichever shell shows */
  @media (max-width: 640px) {
    .cols-head { display: none; }
    .cmp { display: flex; overflow-x: auto; scroll-snap-type: x mandatory; -webkit-overflow-scrolling: touch; }
    .cmp > .cell { flex: 0 0 100%; scroll-snap-align: start; }
    .cell:first-child { border-right: 1px dashed var(--ds-color-border); }
    .cell-label { display: block; }
  }
</style>
