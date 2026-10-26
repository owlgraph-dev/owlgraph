<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Inside a sheet already, the picker is a page of that sheet: never a dialog
  // stacked on a sheet. A pick closes through onOpenChange(false) too, after
  // onPick (a link needs the selection the close clears), since bits-ui calls
  // onOpenChange only for its own closes.
  import { MediaQuery } from 'svelte/reactivity';
  import { BottomSheet, Dialog, PHONE_SHELL_MEDIA, getSheetPageOutlet } from '$lib/design-system';
  import * as m from '$lib/paraglide/messages';
  import type { NodeSearchResult } from '../types';
  import NodePickerPanel from './NodePickerPanel.svelte';
  import type { NodeMark, NodePickerCreate, PickerRow } from './nodePicker';
  import type { NodeType } from '$lib/features/nodes';

  let {
    open,
    onOpenChange,
    title,
    placeholder,
    types,
    scope = true,
    exclude,
    mark,
    rowAction,
    create,
    recent,
    leading,
    note,
    onPick,
  }: {
    open: boolean;
    /** Called for every close, a pick's included. */
    onOpenChange: (open: boolean) => void;
    title: string;
    placeholder: string;
    types: readonly NodeType[];
    scope?: boolean;
    exclude?: ReadonlySet<string>;
    mark?: (node: NodeSearchResult) => NodeMark | null;
    rowAction: string | ((node: NodeSearchResult) => string);
    create?: NodePickerCreate;
    /** Before a term is typed: this many of the nodes the viewer worked on last. */
    recent?: number;
    /** Rows of the caller's own before the matches (a link picker's typed address); picking one is the caller's, who closes. */
    leading?: (term: string) => PickerRow[];
    /** A line of guidance under the list. */
    note?: string;
    onPick: (node: NodeSearchResult) => void;
  } = $props();

  const phone = new MediaQuery(PHONE_SHELL_MEDIA);
  // A sheet around: the picker is a page of it.
  const sheet = getSheetPageOutlet();
  $effect(() => {
    if (!sheet || !open) return;
    return sheet.show({ title, backLabel: m.node_picker_back(), onBack: () => onOpenChange(false), body: page, fill: true });
  });

  function picked(node: NodeSearchResult) {
    onPick(node);
    onOpenChange(false);
  }
</script>

{#snippet body(hints: boolean)}
  {#if open}
    <NodePickerPanel {title} {placeholder} {types} {scope} {exclude} {mark} {rowAction} {create} {recent} {leading} {note} {hints} onPick={picked} />
  {/if}
{/snippet}

{#snippet page()}
  <NodePickerPanel {title} {placeholder} {types} {scope} {exclude} {mark} {rowAction} {create} {recent} {leading} {note} hints={false} onPick={picked} />
{/snippet}

{#if sheet}
  <!-- Shown as a page of the sheet around (above). -->
{:else if phone.current}
  <BottomSheet {open} {onOpenChange} {title} size="lg" body="fill" closeLabel={m.node_picker_close()}>
    {@render body(false)}
  </BottomSheet>
{:else}
  <Dialog {open} {onOpenChange} {title} size="lg" body="fill">
    {@render body(true)}
  </Dialog>
{/if}
