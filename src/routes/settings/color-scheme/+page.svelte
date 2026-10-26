<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The scheme pages without their own render in (docs/architecture/theming.md, "Letting
  // pages adapt"). Light and dark apply at once; adaptive passes a checklist first.
  import { tick } from 'svelte';
  import { enhance } from '$app/forms';
  import {
    Button,
    Checkbox,
    Dialog,
    SettingsRow,
    SegmentedControl,
    SegmentedControlItem,
    Table,
    TableRow,
    TableCell,
    toast,
    type TableColumn,
  } from '$lib/design-system';
  import Icon from '$lib/design-system/Icon.svelte';
  import SettingsPageHead from '$lib/shell/SettingsPageHead.svelte';
  import { nodePath } from '$lib/features/nodes';
  import { CONTENT_SCHEMES, type ContentScheme } from '$lib/features/content';
  import * as m from '$lib/paraglide/messages';

  let { data } = $props();

  const label: Record<ContentScheme, () => string> = {
    light: m.content_scheme_option_light,
    dark: m.content_scheme_option_dark,
    adaptive: m.content_scheme_option_adaptive,
  };

  let form = $state<HTMLFormElement | null>(null);
  let chosen = $state<ContentScheme | null>(null);
  let confirmOpen = $state(false);
  let reviewedReport = $state(false);
  let reviewedHtml = $state(false);
  let previewed = $state(false);

  const pages = $derived(data.readiness.pages);
  const htmlBlocks = $derived(pages.reduce((sum, p) => sum + p.html, 0));
  const paletteOk = $derived(data.themeColorShortfalls.length === 0);
  const canConfirm = $derived(
    paletteOk && (reviewedReport || pages.length === 0) && (reviewedHtml || htmlBlocks === 0) && previewed
  );

  const columns = $derived<TableColumn[]>([
    { label: m.settings_color_scheme_col_page(), width: '18rem' },
    { label: m.settings_color_scheme_col_findings() },
    { label: m.settings_col_actions(), align: 'end', hideLabel: true },
  ]);

  function choose(scheme: ContentScheme) {
    if (scheme === data.schemeDefault) return;
    if (scheme === 'adaptive') {
      reviewedReport = reviewedHtml = previewed = false;
      confirmOpen = true;
      return;
    }
    submit(scheme);
  }

  async function submit(scheme: ContentScheme) {
    chosen = scheme;
    await tick();
    form?.requestSubmit();
  }

  function findings(p: (typeof pages)[number]): string {
    const parts = [];
    if (p.text) parts.push(m.settings_color_scheme_report_text({ count: p.text }));
    if (p.border) parts.push(m.settings_color_scheme_report_border({ count: p.border }));
    if (p.html) parts.push(m.settings_color_scheme_report_html({ count: p.html }));
    return parts.join(' · ');
  }

  const shortfalls = $derived(
    data.themeColorShortfalls.map((s) => `${s.foreground} / ${s.ground} (${s.scheme})`).join(', ')
  );
</script>

<SettingsPageHead title={m.settings_color_scheme_title()} intro={m.settings_color_scheme_intro()} />

<form
  method="POST"
  action="?/setDefault"
  bind:this={form}
  use:enhance={() => async ({ result, update }) => {
    await update({ reset: false });
    confirmOpen = false;
    if (result.type === 'success') toast.success(m.settings_color_scheme_saved());
    else toast.error(m.content_scheme_apply_failed());
  }}
  class="hidden-form"
>
  <input type="hidden" name="scheme" value={chosen ?? ''} />
</form>

<div class="rows">
  <SettingsRow label={m.settings_color_scheme_default_label()} description={m.settings_color_scheme_default_desc()}>
    <SegmentedControl type="single" value={data.schemeDefault} ariaLabel={m.settings_color_scheme_default_label()}>
      {#each CONTENT_SCHEMES as scheme (scheme)}
        <SegmentedControlItem value={scheme} onclick={() => choose(scheme)}>{label[scheme]()}</SegmentedControlItem>
      {/each}
    </SegmentedControl>
  </SettingsRow>

  <SettingsRow label={m.settings_color_scheme_report_label()} description={m.settings_color_scheme_report_desc()} layout="wide">
    <p class="summary">
      {m.settings_color_scheme_report_summary({ inheriting: data.readiness.inheriting, pinned: data.readiness.pinned })}
      {pages.length ? m.settings_color_scheme_report_findings({ count: pages.length }) : m.settings_color_scheme_report_ready()}
    </p>
    {#if pages.length}
      <Table {columns} minWidth="40rem" ariaLabel={m.settings_color_scheme_report_label()}>
        {#each pages as p (p.id)}
          <TableRow>
            <TableCell truncate title={p.title}>{p.title}</TableCell>
            <TableCell muted>{findings(p)}</TableCell>
            <TableCell actions>
              <a class="link action" href={nodePath(p.namespace_slug, p.slug, { edit: true })}>{m.settings_color_scheme_report_edit()}</a>
              <a class="link action" href={`${nodePath(p.namespace_slug, p.slug)}?scheme=dark`} target="_blank" rel="noopener">{m.settings_color_scheme_report_preview()}</a>
            </TableCell>
          </TableRow>
        {/each}
      </Table>
      <form
        method="POST"
        action="?/keepLight"
        use:enhance={() => async ({ result, update }) => {
          await update({ reset: false });
          if (result.type === 'success') toast.success(m.settings_color_scheme_pinned({ count: Number(result.data?.pinned ?? 0) }));
          else toast.error(m.content_scheme_apply_failed());
        }}
        class="keep-light"
      >
        {#each pages as p (p.id)}<input type="hidden" name="id" value={p.id} />{/each}
        <Button type="submit">{m.settings_color_scheme_pin_light()}</Button>
      </form>
    {/if}
  </SettingsRow>
</div>

<Dialog bind:open={confirmOpen} title={m.settings_color_scheme_confirm_title()} description={m.settings_color_scheme_confirm_description()}>
  <ul class="checklist">
    <li>
      {#if pages.length}
        <Checkbox bind:checked={reviewedReport}>{m.settings_color_scheme_check_report()}</Checkbox>
        <form
          method="POST"
          action="?/keepLight"
          use:enhance={() => async ({ result, update }) => {
            await update({ reset: false });
            if (result.type === 'success') toast.success(m.settings_color_scheme_pinned({ count: Number(result.data?.pinned ?? 0) }));
          }}
          class="nested"
        >
          {#each pages as p (p.id)}<input type="hidden" name="id" value={p.id} />{/each}
          <Button type="submit" size="sm">{m.settings_color_scheme_pin_light()}</Button>
        </form>
      {:else}
        <p class="status done"><span class="glyph" aria-hidden="true"><Icon name="check" size={16} /></span>{m.settings_color_scheme_check_report_none()}</p>
      {/if}
    </li>
    <li>
      {#if paletteOk}
        <p class="status done"><span class="glyph" aria-hidden="true"><Icon name="check" size={16} /></span>{m.settings_color_scheme_check_palette()}</p>
      {:else}
        <p class="status failed"><span class="glyph" aria-hidden="true"><Icon name="alert-circle" size={16} /></span>{m.settings_color_scheme_check_palette_failed({ pairs: shortfalls })}</p>
      {/if}
    </li>
    <li>
      {#if htmlBlocks}
        <Checkbox bind:checked={reviewedHtml}>{m.settings_color_scheme_check_html({ count: htmlBlocks })}</Checkbox>
      {:else}
        <p class="status done"><span class="glyph" aria-hidden="true"><Icon name="check" size={16} /></span>{m.settings_color_scheme_check_html_none()}</p>
      {/if}
    </li>
    <li>
      <Checkbox bind:checked={previewed}>{m.settings_color_scheme_check_preview()}</Checkbox>
      {#if data.readiness.sample.length}
        <p class="nested">
          {#each data.readiness.sample as p, i (p.id)}{#if i}{', '}{/if}<a class="link" href={`${nodePath(p.namespace_slug, p.slug)}?scheme=dark`} target="_blank" rel="noopener">{p.title}</a>{/each}
        </p>
      {/if}
    </li>
  </ul>
  {#snippet footer()}
    <Button variant="ghost" onclick={() => (confirmOpen = false)}>{m.settings_color_scheme_cancel()}</Button>
    <Button variant="primary" disabled={!canConfirm} onclick={() => submit('adaptive')}>{m.settings_color_scheme_confirm()}</Button>
  {/snippet}
</Dialog>

<style>
  .hidden-form { display: none; }
  .rows { border-top: 1px solid var(--ds-color-border); }
  .summary { margin: 0 0 var(--ds-space-md); color: var(--ds-color-fg); font-size: var(--ds-text-sm); }
  .keep-light { display: flex; justify-content: flex-end; padding-top: var(--ds-space-md); }
  .link { color: var(--ds-color-link); font-size: var(--ds-text-sm); }
  .action + .action { margin-left: var(--ds-space-md); }
  .checklist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--ds-space-md); }
  .status { display: flex; align-items: flex-start; gap: var(--ds-space-sm); margin: 0; font-size: var(--ds-text-md); color: var(--ds-color-fg); }
  .glyph { display: inline-flex; flex: none; align-items: center; height: 1.5em; }
  .done .glyph { color: var(--ds-color-success); }
  .failed .glyph { color: var(--ds-color-danger); }
  .nested { margin: var(--ds-space-sm) 0 0 1.75rem; font-size: var(--ds-text-sm); }
</style>
