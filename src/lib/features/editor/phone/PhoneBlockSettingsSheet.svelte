<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // An embed block's settings panel, in a sheet; the capability sections stay
  // the desktop's (docs/architecture/editor.md, "Block settings").
  import { BottomSheet } from '$lib/design-system';
  import * as m from '$lib/paraglide/messages';
  import { pluginEditorBlock } from '$lib/plugins/editor';
  import { blockSettingsOf } from '../blocks/settings';
  import BlockSettingsSection from '../blockSettings/BlockSettingsSection.svelte';
  import { anyAttrModified } from '../blockSettings/modified';
  import type { BlockSettingsActions, Target } from '../blockSettings/types';
  import type { EditorCore } from '../core/editorCore.svelte';

  let {
    open,
    onOpenChange,
    target,
    core,
    pageId,
    actions,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    target: Target | null;
    core: EditorCore;
    pageId: string | null;
    actions: BlockSettingsActions;
  } = $props();

  const editor = $derived(core.editor ?? null);
  const Settings = $derived(target ? blockSettingsOf(target.type) : undefined);
  const sections = $derived(target ? (pluginEditorBlock(target.type)?.sections ?? []) : []);
  const overlayOpenChange = (o: boolean) => actions.overlayOpenChange?.(o);
</script>

<BottomSheet {open} {onOpenChange} title={m.editor_phone_block_settings()} size="lg" closeLabel={m.editor_phone_block_settings_close()}>
  {#if target}
    {@const t = target}
    {#if Settings}
      <Settings target={t} {editor} {actions} />
    {/if}
    {#each sections as section (section.id)}
      {@const Section = section.component}
      <BlockSettingsSection id="block:{section.id}" title={section.title()} modified={anyAttrModified(editor, t.type, t.attrs, [...(section.modifiedKeys ?? [])])}>
        <Section target={t} {editor} {pageId} {overlayOpenChange} />
      </BlockSettingsSection>
    {/each}
  {/if}
</BottomSheet>
