<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The desktop toolbar. It reads the editor core and writes through it; its
  // open flags are the editor's (overlays.svelte.ts), since the block settings
  // panel opens its link picker to retarget a quick link and every flag feeds
  // the editor's overlay check.
  import { DropdownMenu, DropdownMenuItem, TriggerFace } from '$lib/design-system';
  import InsertMenuItems from '../InsertMenuItems.svelte';
  import type { NodePickerCreate } from '$lib/features/search/picker';
  import type { InsertCommands } from '../../commands/insert';
  import { sizeLabel, paragraphStylePreviewCss, PARAGRAPH_STYLE_TEXTBLOCKS, colorCss, getTypographyRegistry, editTier } from '$lib/features/content';
  import { Toolbar, ToolbarButton, ToolbarGroup, ToolbarGroupItem } from '$lib/design-system';
  import { Toolbar as BitsToolbar } from 'bits-ui';
  import Icon from '$lib/design-system/Icon.svelte';
  import * as m from '$lib/paraglide/messages';
  import type { EditorCore } from '../../core/editorCore.svelte';
  import type { SaveAction } from '../../session/saveAction.svelte';
  import type { CanvasScheme } from '../../shared/canvasScheme.svelte';
  import type { EditorOverlays } from '../overlays.svelte';
  import type { ImagePicker } from '../imagePicker.svelte';
  import { preserveEditorFocusOnClose } from '../keyboard';
  import TypographyPopover from './TypographyPopover.svelte';
  import CustomStylePicker from './CustomStylePicker.svelte';
  import LinkPickerPopover from './LinkPickerPopover.svelte';
  import PropertyPicker from './PropertyPicker.svelte';

  let {
    core,
    overlays,
    insert,
    enabledPlugins,
    linkNamespace = null,
    locale,
    propertyGroups = [],
    propSuggestions = [],
    images,
    save,
    scheme,
    blockSettingsOpen = true,
    onDeleteCurrentBlock,
  }: {
    core: EditorCore;
    overlays: EditorOverlays;
    insert: InsertCommands;
    /** The plugins turned on (their ids): the Insert menu offers their blocks. */
    enabledPlugins: ReadonlySet<string>;
    /** The page's namespace, where the link picker makes a page it is asked for. */
    linkNamespace?: NodePickerCreate['namespace'] | null;
    /** The content language a site page's card is labelled in. */
    locale?: string;
    propertyGroups?: { slug: string; label: string; description: string }[];
    propSuggestions?: { name: string; label: string; datatype: string }[];
    images: ImagePicker;
    save: SaveAction;
    /** The canvas's scheme: what a colour must read in, and an adaptive page's preview. */
    scheme: CanvasScheme;
    /** The toolbar shows its own tier switcher only while the
     * block settings panel, which has one, is collapsed. */
    blockSettingsOpen?: boolean;
    onDeleteCurrentBlock: () => void;
  } = $props();

  const format = $derived(core.format);
  // Elsewhere than on a text block the paragraph style picker stays, disabled,
  // so the toolbar never shifts.
  const paragraphStyleTarget = $derived(!!core.selection.textTarget && PARAGRAPH_STYLE_TEXTBLOCKS.has(core.selection.textTarget.type));
  // A node selection's typography is the block's: without one, nothing to edit.
  const typographyDisabled = $derived(format.isNodeSelection && !format.blockScope);
  const colorWarning = $derived(format.colorWarning(scheme.resolved));
  // The canvas's preview scheme for an adaptive page; a pinned page has no toggle.
  const schemePreview = $derived(scheme.resolved === 'adaptive' ? scheme.preview : null);
  const paragraphStyles = $derived(format.paragraphStyleOptions());
</script>

<Toolbar class="toolbar" aria-label={m.editor_toolbar_aria()}>
  <ToolbarGroup type="multiple" class="tb-group" value={[...(format.boldActive ? ['bold'] : []), ...(format.active.italic ? ['italic'] : [])]}>
    <ToolbarGroupItem value="bold" disabled={typographyDisabled} aria-pressed={format.boldActive} title={m.editor_toolbar_bold()} aria-label={m.editor_toolbar_bold()} onclick={format.toggleBold}><Icon name="bold" /></ToolbarGroupItem>
    <div class="tb-insert">
      <BitsToolbar.Button disabled={typographyDisabled}>
        {#snippet child({ props: toolbarProps }: { props: Record<string, unknown> })}
          <TypographyPopover {core} {overlays} name="weight" label={m.editor_typography_weight_label()} fields={['weight']} {colorWarning} {toolbarProps}>
            {#snippet trigger()}
              <TriggerFace variant="toolbar" split><Icon name="chevron" size={14} /></TriggerFace>
            {/snippet}
          </TypographyPopover>
        {/snippet}
      </BitsToolbar.Button>
    </div>
    <ToolbarGroupItem value="italic" aria-pressed={format.active.italic} title={m.editor_toolbar_italic()} aria-label={m.editor_toolbar_italic()} onclick={() => core.editor?.chain().focus().toggleItalic().run()}><Icon name="italic" /></ToolbarGroupItem>
  </ToolbarGroup>
  <span class="tb-sep"></span>
  <div class="tb-group">
    <!-- One pick sets a text block's tag and look (docs/architecture/typography.md); each
         entry is drawn in its own look, its tag beside it. -->
    <div class="tb-insert">
      <BitsToolbar.Button disabled={!paragraphStyleTarget}>
        {#snippet child({ props: toolbarProps }: { props: Record<string, unknown> })}
          <DropdownMenu open={overlays.paragraphStyle} onOpenChange={(v) => (overlays.paragraphStyle = v)} disabled={!paragraphStyleTarget} align="start" ariaLabel={m.editor_paragraph_style_label()} onCloseAutoFocus={preserveEditorFocusOnClose} triggerProps={{ ...toolbarProps, title: m.editor_paragraph_style_label(), 'aria-label': m.editor_paragraph_style_label() }}>
            {#snippet trigger()}
              <TriggerFace variant="toolbar" active={format.active.heading}><Icon name="heading" /><Icon name="chevron" size={14} /></TriggerFace>
            {/snippet}
            {#each paragraphStyles as style (style.id)}
              <DropdownMenuItem active={format.paragraphStyleId === style.id} onSelect={() => format.setParagraphStyle(style.id)}>
                <span class="bs-row"><span class="bs-label" style={paragraphStylePreviewCss(style, getTypographyRegistry())}>{style.label}</span><span class="bs-tag">{style.renderAs}</span></span>
              </DropdownMenuItem>
            {/each}
          </DropdownMenu>
        {/snippet}
      </BitsToolbar.Button>
    </div>
    <div class="tb-insert">
      <BitsToolbar.Button disabled={typographyDisabled}>
        {#snippet child({ props: toolbarProps }: { props: Record<string, unknown> })}
          <CustomStylePicker {core} {overlays} {toolbarProps} />
        {/snippet}
      </BitsToolbar.Button>
    </div>
    <div class="tb-insert">
      <BitsToolbar.Button disabled={typographyDisabled}>
        {#snippet child({ props: toolbarProps }: { props: Record<string, unknown> })}
          <TypographyPopover {core} {overlays} name="family" label={m.editor_typography_family_label()} fields={['family']} {colorWarning} {toolbarProps}>
            {#snippet trigger()}
              <TriggerFace variant="toolbar"><Icon name="type" /><Icon name="chevron" size={14} /></TriggerFace>
            {/snippet}
          </TypographyPopover>
        {/snippet}
      </BitsToolbar.Button>
    </div>
    <div class="tb-insert">
      <BitsToolbar.Button disabled={typographyDisabled}>
        {#snippet child({ props: toolbarProps }: { props: Record<string, unknown> })}
          <TypographyPopover {core} {overlays} name="size" label={m.editor_toolbar_font_size_aria()} fields={['size']} {colorWarning} {toolbarProps}>
            {#snippet trigger()}
              <TriggerFace variant="toolbar">
                {#if format.sizeValue === ''}
                  <span class="tb-size tb-size-empty">{m.editor_toolbar_font_size_placeholder()}</span>
                {:else}
                  <span class="tb-size">{sizeLabel(format.sizeValue)}</span>
                {/if}
                <Icon name="chevron" size={14} />
              </TriggerFace>
            {/snippet}
          </TypographyPopover>
        {/snippet}
      </BitsToolbar.Button>
    </div>
    <div class="tb-insert">
      <BitsToolbar.Button disabled={typographyDisabled}>
        {#snippet child({ props: toolbarProps }: { props: Record<string, unknown> })}
          <TypographyPopover {core} {overlays} name="color" label={m.editor_typography_color_label()} fields={['color']} {colorWarning} {toolbarProps}>
            {#snippet trigger()}
              <TriggerFace variant="toolbar" icon>
                <span class="tb-color-a" style={`border-bottom-color:${format.colorSwatch ? colorCss(format.colorSwatch) : 'currentColor'}`}>A</span>
              </TriggerFace>
            {/snippet}
          </TypographyPopover>
        {/snippet}
      </BitsToolbar.Button>
    </div>
    <div class="tb-insert">
      <BitsToolbar.Button disabled={typographyDisabled}>
        {#snippet child({ props: toolbarProps }: { props: Record<string, unknown> })}
          <TypographyPopover {core} {overlays} name="metrics" label={m.editor_typography_metrics_label()} fields={['lineHeight', 'letterSpacing']} {colorWarning} {toolbarProps}>
            {#snippet trigger()}
              <TriggerFace variant="toolbar" split><Icon name="chevron" size={14} /></TriggerFace>
            {/snippet}
          </TypographyPopover>
        {/snippet}
      </BitsToolbar.Button>
    </div>
  </div>
  <span class="tb-sep"></span>
  <div class="tb-group">
    <ToolbarButton active={format.active.bullet} aria-pressed={format.active.bullet} title={m.editor_toolbar_bullet_list()} aria-label={m.editor_toolbar_bullet_list()} onclick={() => core.editor?.chain().focus().toggleBulletList().run()}><Icon name="list" /></ToolbarButton>
    <ToolbarButton active={format.active.ordered} aria-pressed={format.active.ordered} title={m.editor_toolbar_numbered_list()} aria-label={m.editor_toolbar_numbered_list()} onclick={() => core.editor?.chain().focus().toggleOrderedList().run()}><Icon name="list-ordered" /></ToolbarButton>
    <ToolbarButton active={format.active.code} aria-pressed={format.active.code} title={m.editor_toolbar_code_block()} aria-label={m.editor_toolbar_code_block()} onclick={() => core.editor?.chain().focus().toggleCodeBlock().run()}><Icon name="code" /></ToolbarButton>
  </div>
  <span class="tb-sep"></span>
  <div class="tb-group tb-insert">
    <BitsToolbar.Button>
      {#snippet child({ props: toolbarProps }: { props: Record<string, unknown> })}
        <DropdownMenu open={overlays.insert} onOpenChange={(v) => (overlays.insert = v)} align="start" ariaLabel={m.editor_insert_menu_title()} onCloseAutoFocus={preserveEditorFocusOnClose} triggerProps={{ ...toolbarProps, title: m.editor_insert_menu_title() }}>
          {#snippet trigger()}
            <TriggerFace variant="toolbar"><Icon name="plus" size={16} /><span>{m.editor_insert_menu_label()}</span><Icon name="chevron" size={14} /></TriggerFace>
          {/snippet}
          <InsertMenuItems
            target={{ mode: 'insert' }}
            {enabledPlugins}
            commands={insert}
            onSelect={() => (overlays.insert = false)}
          />
        </DropdownMenu>
      {/snippet}
    </BitsToolbar.Button>
  </div>
  <BitsToolbar.Button>
    {#snippet child({ props: toolbarProps }: { props: Record<string, unknown> })}
      <LinkPickerPopover {core} {overlays} namespace={linkNamespace} {locale} {toolbarProps} />
    {/snippet}
  </BitsToolbar.Button>
  <ToolbarButton title={m.editor_toolbar_insert_image()} aria-label={m.editor_toolbar_insert_image()} onclick={images.pickToInsert}><Icon name="image" /></ToolbarButton>
  <BitsToolbar.Button>
    {#snippet child({ props: toolbarProps }: { props: Record<string, unknown> })}
      <PropertyPicker {core} {overlays} {propertyGroups} {propSuggestions} {toolbarProps} />
    {/snippet}
  </BitsToolbar.Button>
  <span class="tb-sep"></span>
  <ToolbarButton variant="ghost-danger" title={m.editor_toolbar_delete_block()} aria-label={m.editor_toolbar_delete_block()} onclick={onDeleteCurrentBlock}><Icon name="trash" /></ToolbarButton>
  <span class="tb-spacer"></span>
  {#if schemePreview}
    <ToolbarGroup type="single" class="tb-viewport" aria-label={m.editor_toolbar_scheme_group_aria()} value={schemePreview} onValueChange={(v) => { if (v) scheme.preview = v as 'light' | 'dark'; }}>
      <ToolbarGroupItem value="light" aria-pressed={schemePreview === 'light'} title={m.editor_toolbar_scheme_light()} aria-label={m.editor_toolbar_scheme_light()} onclick={() => (scheme.preview = 'light')}><Icon name="sun" /></ToolbarGroupItem>
      <ToolbarGroupItem value="dark" aria-pressed={schemePreview === 'dark'} title={m.editor_toolbar_scheme_dark()} aria-label={m.editor_toolbar_scheme_dark()} onclick={() => (scheme.preview = 'dark')}><Icon name="moon" /></ToolbarGroupItem>
    </ToolbarGroup>
    <span class="tb-sep"></span>
  {/if}
  {#if !blockSettingsOpen}
    <ToolbarGroup type="single" class="tb-viewport" aria-label={m.editor_toolbar_tier_group_aria()} value={$editTier} onValueChange={(v) => { if (v) editTier.set(v as 'desktop' | 'tablet' | 'phone'); }}>
      <ToolbarGroupItem value="desktop" aria-pressed={$editTier === 'desktop'} title={m.editor_toolbar_tier_desktop_title()} aria-label={m.editor_toolbar_tier_desktop_aria()} onclick={() => editTier.set('desktop')}><Icon name="monitor" /></ToolbarGroupItem>
      <ToolbarGroupItem value="tablet" aria-pressed={$editTier === 'tablet'} title={m.editor_toolbar_tier_tablet_title()} aria-label={m.editor_toolbar_tier_tablet_aria()} onclick={() => editTier.set('tablet')}><Icon name="tablet" /></ToolbarGroupItem>
      <ToolbarGroupItem value="phone" aria-pressed={$editTier === 'phone'} title={m.editor_toolbar_tier_phone_title()} aria-label={m.editor_toolbar_tier_phone_aria()} onclick={() => editTier.set('phone')}><Icon name="phone" /></ToolbarGroupItem>
    </ToolbarGroup>
    <span class="tb-sep"></span>
  {/if}
  {#if save.savedAt}<span class="saved">{m.editor_toolbar_saved({ time: save.savedAt })}</span>{/if}
  <ToolbarButton variant="primary" onclick={save.run} disabled={save.saving}>{save.saving ? m.editor_toolbar_saving() : m.editor_toolbar_save()}</ToolbarButton>
</Toolbar>

<style>
  /* Class props land in the primitives' own scope, hence :global()
     (docs/architecture/design-system/primitives.md, "Styling Bits UI wrapper primitives"). */
  :global(.toolbar) { display: flex; gap: 0.2rem; align-items: center; flex-wrap: wrap; padding: 0.5rem}
  :global(.tb-group) { display: flex; gap: 0.15rem; align-items: center; }
  .tb-sep { width: 1px; align-self: center; height: 1.4rem; background: var(--ds-color-border); margin: 0 0.35rem; }
  .tb-spacer { flex: 1; }
  :global(.tb-viewport) { display: inline-flex; gap: 2px; padding: 2px; background: var(--ds-color-well); border-radius: var(--ds-radius-md); }
  .tb-insert { position: relative; }
  :global(.ds-popover-content.typo-pop) { width: max-content; min-width: 160px; max-width: 280px; padding: 0.7rem 0.8rem; }
  /* A steady minimum width keeps the toolbar from shifting as the size changes. */
  .tb-size { min-width: 2.5rem; font-size: var(--ds-text-sm); text-align: start; }
  .tb-size-empty { color: var(--ds-color-muted); }
  .tb-color-a { display: inline-block; font-weight: 700; font-size: 0.95rem; line-height: 1; border-bottom: 2.5px solid currentColor; padding-bottom: 1px; }
  .bs-row { display: flex; align-items: baseline; justify-content: space-between; gap: var(--ds-space-md); width: 100%; min-width: 11rem; }
  .bs-label { line-height: 1.3; }
  .bs-tag { font-family: var(--ds-font-mono); font-size: var(--ds-text-xs); color: var(--ds-color-muted); }
  .saved { font-size: 0.8rem; color: var(--ds-color-muted); margin-right: 0.3rem; }
</style>
