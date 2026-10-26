<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The variant decides which Surface fields the card carries. The target
  // opens the toolbar's link picker in retarget mode, the only picker there is.
  import { FieldRow, SegmentedControl, SegmentedControlItem, Switch, Input, IconPickerField, Button } from '$lib/design-system';
  import Icon from '$lib/design-system/Icon.svelte';
  import { QUICK_LINK_VARIANTS, quickLinkVariant, normalizeUrl, isValidUrl, type QuickLinkVariant } from '$lib/features/content';
  import * as m from '$lib/paraglide/messages';
  import BlockSettingsSection from '../../blockSettings/BlockSettingsSection.svelte';
  import { anyAttrModified } from '../../blockSettings/modified';
  import { labelFor } from '../../blockSettings/blockLabels';
  import type { BlockSettingsProps } from '../../blockSettings/types';

  let { target, editor, actions }: BlockSettingsProps = $props();

  const uid = $props.id();
  const attrs = $derived(target.attrs);
  const refType = $derived((attrs.refType as string | undefined) ?? 'page');
  const url = $derived((attrs.url as string | undefined) ?? '');
  const urlInvalid = $derived(!!url && !isValidUrl(url));
  const typeLabel = $derived(refType === 'document' ? m.editor_block_settings_quick_link_type_document() : m.editor_block_settings_quick_link_type_page());
  const targetText = $derived((attrs.label as string) || (attrs.targetSlug as string) || typeLabel);

  const variantLabel: Record<QuickLinkVariant, () => string> = {
    link: m.editor_block_settings_quick_link_style_bare,
    outlined: m.editor_block_settings_quick_link_style_outlined,
    button: m.editor_block_settings_quick_link_style_button,
  };
  const variantTitle: Record<QuickLinkVariant, () => string> = {
    link: m.editor_block_settings_quick_link_style_bare_title,
    outlined: m.editor_block_settings_quick_link_style_outlined_title,
    button: m.editor_block_settings_quick_link_style_button_title,
  };
  const variant = $derived(quickLinkVariant(attrs));
  const embed = $derived(actions.quickLinkEmbed?.(attrs) ?? null);

  // `label` is excluded: every card has one from the moment it's inserted,
  // so it would mark every card as modified.
  const MODIFIED_KEYS = ['variant', 'underline', 'icon', 'iconPosition'];
</script>

<BlockSettingsSection id="block" title={labelFor(target.type)} modified={anyAttrModified(editor, target.type, attrs, MODIFIED_KEYS)}>
  <FieldRow layout="stack" label={m.editor_block_settings_quick_link_label_label()} for="{uid}-label">
    <Input
      id="{uid}-label"
      size="sm"
      value={(attrs.label as string | undefined) ?? ''}
      placeholder={m.editor_block_settings_quick_link_label_placeholder()}
      onchange={(e: Event) => target.update({ label: (e.currentTarget as HTMLInputElement).value })}
    />
  </FieldRow>

  <FieldRow layout="stack" label={m.editor_block_settings_quick_link_style_label()}>
    <SegmentedControl type="single" size="sm" stretch value={variant} ariaLabel={m.editor_block_settings_quick_link_style_label()}>
      {#each QUICK_LINK_VARIANTS as name (name)}
        <SegmentedControlItem value={name} title={variantTitle[name]()} onclick={() => target.update({ variant: name })}>{variantLabel[name]()}</SegmentedControlItem>
      {/each}
    </SegmentedControl>
  </FieldRow>

  {#if variant === 'link'}
    <FieldRow label={m.editor_block_settings_quick_link_underline()}>
      <Switch checked={attrs.underline !== false} onCheckedChange={(v) => target.update({ underline: v })} ariaLabel={m.editor_block_settings_quick_link_underline()} />
    </FieldRow>
  {/if}

  <FieldRow label={m.editor_block_settings_quick_link_icon_label()}>
    <IconPickerField
      value={(attrs.icon as string | null | undefined) ?? null}
      onValueChange={(ic) => target.update({ icon: ic })}
      noneLabel={m.editor_block_settings_quick_link_icon_none()}
      noneTitle={m.editor_block_settings_quick_link_icon_none()}
      ariaLabel={m.editor_block_settings_quick_link_icon_label()}
      onOpenChange={(o) => actions.overlayOpenChange?.(o)}
    />
  </FieldRow>

  {#if attrs.icon}
    <FieldRow label={m.editor_block_settings_quick_link_icon_position_label()}>
      <SegmentedControl type="single" size="sm" value={(attrs.iconPosition as string | undefined) ?? 'left'} ariaLabel={m.editor_block_settings_quick_link_icon_position_label()}>
        <SegmentedControlItem value="left" onclick={() => target.update({ iconPosition: 'left' })} title={m.editor_block_settings_quick_link_icon_position_left_title()}>{m.editor_block_settings_quick_link_icon_position_left()}</SegmentedControlItem>
        <SegmentedControlItem value="top" onclick={() => target.update({ iconPosition: 'top' })} title={m.editor_block_settings_quick_link_icon_position_top_title()}>{m.editor_block_settings_quick_link_icon_position_top()}</SegmentedControlItem>
      </SegmentedControl>
    </FieldRow>
  {/if}

  <FieldRow
    layout="stack"
    label={m.editor_block_settings_quick_link_target_label()}
    info={refType === 'url' ? m.editor_block_settings_quick_link_target_url_info() : undefined}
    error={refType === 'url' && urlInvalid ? m.editor_block_settings_quick_link_target_url_error() : null}
  >
    {#if refType === 'url'}
      <Input
        size="sm"
        value={url}
        placeholder={m.editor_block_settings_quick_link_target_url_placeholder()}
        aria-label={m.editor_block_settings_quick_link_target_label()}
        onchange={(e: Event) => target.update({ url: normalizeUrl((e.currentTarget as HTMLInputElement).value) })}
      />
      {#if target.id}
        {@const id = target.id}
        <span class="qls-link"><Button variant="link" size="sm" onclick={() => actions.retarget?.(id)}>{m.editor_block_settings_quick_link_target_pick()}</Button></span>
      {/if}
    {:else}
      <!-- ui-check-allow: raw-element — the target's preview (title over type, chevron): a two-line face no Button size holds, like ColorPickerField's swatch trigger -->
      <button type="button" class="qls-target" title={m.editor_block_settings_quick_link_change_target()} disabled={!target.id} onclick={() => target.id && actions.retarget?.(target.id)}>
        <span class="qls-target-icon"><Icon name="file" size={16} /></span>
        <span class="qls-target-text">
          <span class="qls-target-title">{targetText}</span>
          <span class="qls-target-type">{typeLabel}</span>
        </span>
        <span class="qls-target-chevron"><Icon name="chevron" size={12} /></span>
      </button>
      <span class="qls-link"><Button variant="link" size="sm" onclick={() => target.update({ refType: 'url' })}>{m.editor_block_settings_quick_link_use_url()}</Button></span>
    {/if}
  </FieldRow>

  {#if embed && target.id}
    {@const id = target.id}
    <!-- docs/architecture/blocks/node-embeds.md, "A quick link becomes a block" -->
    <FieldRow layout="stack" label={m.editor_embed_quick_link_label()} info={'reason' in embed ? undefined : m.editor_embed_quick_link_info()} hint={'reason' in embed ? embed.reason : undefined}>
      <span class="qls-embed">
        <Button size="sm" variant="secondary" disabled={'reason' in embed} onclick={() => actions.embedQuickLink?.(id)}>{m.editor_embed_quick_link()}</Button>
      </span>
    </FieldRow>
  {/if}
</BlockSettingsSection>

<style>
  .qls-target {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    box-sizing: border-box;
    padding: 0.35rem 0.45rem;
    border: 1px solid var(--ds-color-border);
    border-radius: var(--ds-radius-sm);
    background: var(--ds-color-bg);
    color: var(--ds-color-fg);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .qls-target:not(:disabled):hover { border-color: var(--ds-color-border-hover); background: var(--ds-color-fill-hover); }
  .qls-target:not(:disabled):active { border-color: var(--ds-color-border-hover); background: var(--ds-color-fill-pressed); }
  .qls-target:disabled { cursor: default; opacity: var(--ds-opacity-disabled); }
  .qls-target-icon { display: inline-flex; color: var(--ds-color-muted); flex: none; }
  .qls-target-text { display: flex; flex-direction: column; min-width: 0; flex: 1 1 auto; line-height: 1.2; }
  .qls-target-title { font-size: var(--ds-text-sm); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .qls-target-type { font-size: var(--ds-text-xs); color: var(--ds-color-muted); }
  .qls-target-chevron { display: inline-flex; color: var(--ds-color-muted); flex: none; }
  .qls-link { display: block; margin-top: 0.35rem; }
  .qls-embed { display: block; }
</style>
