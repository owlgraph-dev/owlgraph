<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The link picker: links the selected text to a page or a document, or puts
  // a quick-link card at the caret, or retargets the card it was opened for
  // (core/links.svelte.ts). Each pick closes it.
  import { untrack } from 'svelte';
  import { Popover, TriggerFace } from '$lib/design-system';
  import Icon from '$lib/design-system/Icon.svelte';
  import { NodePickerPanel, type NodePickerCreate } from '$lib/features/search/picker';
  import * as m from '$lib/paraglide/messages';
  import { linkPickerRows } from '../../shared/linkPickerRows';
  import type { SitePage } from '../../shared/sitePages';
  import type { EditorCore } from '../../core/editorCore.svelte';
  import type { LinkResult } from '../../core/links.svelte';
  import { linkPickerFocus } from '../keyboard';
  import type { EditorOverlays } from '../overlays.svelte';

  let {
    core,
    overlays,
    namespace = null,
    locale,
    toolbarProps,
  }: {
    core: EditorCore;
    overlays: EditorOverlays;
    /** The page's namespace, where the picker makes a page it is asked for. */
    namespace?: NodePickerCreate['namespace'] | null;
    /** The content language a site page's card is labelled in. */
    locale?: string;
    /** The toolbar button's props: the trigger is one of the toolbar's stops. */
    toolbarProps: Record<string, unknown>;
  } = $props();

  // Read once: a toolbar's core never changes.
  const focus = linkPickerFocus(untrack(() => core));

  function openPicker() {
    if (!core.editor) return;
    core.links.begin();
    overlays.propertyPicker = false;
    overlays.linkPicker = true;
  }
  function closePicker() {
    overlays.linkPicker = false;
    core.links.end();
  }
  function choosePickAndClose(r: LinkResult) {
    core.links.choosePick(r);
    closePicker();
  }
  function insertUrlCardAndClose(url: string) {
    core.links.insertUrlCard(url);
    closePicker();
  }
  function placeSitePageAndClose(page: SitePage) {
    core.links.placeSitePage(page, locale);
    closePicker();
  }
</script>

<Popover
  open={overlays.linkPicker}
  onOpenChange={(o) => { if (o) openPicker(); else closePicker(); }}
  onCloseAutoFocus={focus.closeAutoFocus}
  onEscapeKeydown={focus.escape}
  side="bottom"
  align="start"
  size="md"
  triggerProps={{ ...toolbarProps, title: m.editor_link_picker_title(), 'aria-label': m.editor_link_picker_aria() }}
>
  {#snippet trigger()}
    <TriggerFace variant="toolbar" icon><Icon name="link" /></TriggerFace>
  {/snippet}
  <NodePickerPanel
    title={m.editor_link_picker_title()}
    placeholder={core.links.retargetId ? m.editor_link_picker_placeholder_retarget() : m.editor_link_picker_placeholder()}
    types={['page', 'document']}
    rowAction={m.editor_link_picker_action()}
    recent={6}
    create={namespace ? { types: ['page'], namespace } : undefined}
    leading={(term) => linkPickerRows(term, { retargeting: !!core.links.retargetId, insertUrlCard: insertUrlCardAndClose, placeSitePage: placeSitePageAndClose })}
    note={core.links.retargetId ? m.editor_link_picker_hint_retarget() : m.editor_link_picker_hint_default()}
    size="md"
    onPick={(node) => {
      if (node.type !== 'collection') choosePickAndClose({ type: node.type, id: node.id, slug: node.slug, title: node.title });
    }}
  />
</Popover>
