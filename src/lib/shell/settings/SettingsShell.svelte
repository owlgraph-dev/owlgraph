<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The aside and the narrow screen's bar are both always in the DOM, toggled
  // by CSS, so server and hydrated markup agree. The sheet mounts only while
  // open, so there is never a second nav landmark.
  import type { Snippet } from 'svelte';
  import { BottomSheet, Button } from '$lib/design-system';
  import Icon from '$lib/design-system/Icon.svelte';
  import * as m from '$lib/paraglide/messages';
  import SettingsNav from './SettingsNav.svelte';
  import type { SettingsGroup } from './treeModel';

  let {
    groups,
    activeId,
    activeLabel,
    children,
  }: {
    groups: SettingsGroup[];
    activeId: string;
    /** The current section's name, shown in the compact bar. */
    activeLabel: string;
    children: Snippet;
  } = $props();

  let sheetOpen = $state(false);
</script>

<div class="settings-shell">
  <aside class="settings-side">
    <p class="side-title">{m.settings_title()}</p>
    <SettingsNav {groups} {activeId} />
  </aside>

  <div class="settings-compactbar">
    <span class="compactbar-crumb">
      <span class="compactbar-title">{m.settings_title()}</span>
      <span class="compactbar-current">{activeLabel}</span>
    </span>
    <Button variant="ghost" size="sm" onclick={() => (sheetOpen = true)} aria-haspopup="dialog">
      <Icon name="menu" size={16} />
      {m.settings_open_nav()}
    </Button>
  </div>

  <div class="settings-pane">
    {@render children()}
  </div>
</div>

<BottomSheet bind:open={sheetOpen} title={m.settings_title()}>
  <SettingsNav {groups} {activeId} onNavigate={() => (sheetOpen = false)} />
</BottomSheet>

<style>
  .settings-shell {
    display: grid;
    grid-template-columns: 240px minmax(0, 1fr);
    align-items: start;
    /* Rows keep their content's height: on a narrow screen a short page would
       otherwise start halfway down. */
    align-content: start;
    max-width: 1320px;
    margin: 0 auto;
    min-height: 100%;
  }
  /* Sticky against the document, so no ancestor may set an overflow; a
     stretched aside would make sticky a no-op. */
  .settings-side {
    position: sticky;
    top: var(--appbar-top-inset);
    align-self: start;
    box-sizing: border-box;
    max-height: calc(100dvh - var(--appbar-top-inset) - var(--appbar-bottom-inset));
    overflow-y: auto;
    padding: 2rem 1rem 2rem 1.25rem;
    border-right: 1px solid var(--ds-color-border);
  }
  .side-title {
    margin: 0 0 var(--ds-space-md);
    padding: 0 0.6rem;
    font-size: 1.25rem;
    font-weight: var(--ds-weight-semibold);
    letter-spacing: -0.01em;
  }
  .settings-compactbar {
    display: none;
    position: sticky;
    top: var(--appbar-top-inset);
    z-index: 5;
    align-items: center;
    justify-content: space-between;
    gap: var(--ds-space-sm);
    padding: 0.55rem 1rem;
    background: var(--ds-color-bg);
    border-bottom: 1px solid var(--ds-color-border);
  }
  .compactbar-crumb { display: flex; flex-direction: column; min-width: 0; line-height: 1.25; }
  .compactbar-title { font-size: var(--ds-text-xs); color: var(--ds-color-muted); }
  .compactbar-current { font-size: var(--ds-text-md); font-weight: var(--ds-weight-semibold); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* Page content queries the pane's own width, apart from the sidebar breakpoint. */
  .settings-pane {
    container-type: inline-size;
    box-sizing: border-box;
    width: 100%;
    max-width: 1040px;
    padding: 2.25rem 3rem 5rem;
  }
  @media (max-width: 768px) {
    .settings-shell { grid-template-columns: minmax(0, 1fr); }
    .settings-side { display: none; }
    .settings-compactbar { display: flex; }
    .settings-pane { padding: 1.25rem 1rem 3rem; }
    /* An anchor or a field the keyboard reveals stops below the sticky bar:
       its height and a little air. */
    .settings-pane :global([id]) { scroll-margin-top: calc(max(var(--ds-control-h-sm), 2.25rem) + 1.1rem + var(--ds-space-sm)); }
  }
</style>
