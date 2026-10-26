<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The page's colour scheme (docs/architecture/theming.md, "Content scheme"). Adaptive
  // lists what would stop reading on the live document but is still allowed.
  // The draft is taken from `value` on each open and written only on Apply.
  import { Dialog, Button, FormField, RadioGroup, Alert } from '$lib/design-system';
  import { checkAdaptiveReadiness, resolveContentScheme, colorCss, type ContentScheme, type ReadinessFinding } from '$lib/features/content';
  import { formatNumber } from '$lib/platform/i18n/format';
  import { labelFor } from '../blockSettings/blockLabels';
  import * as m from '$lib/paraglide/messages';

  type Choice = 'site' | ContentScheme;

  let {
    open,
    onOpenChange,
    value,
    siteDefault,
    getDoc,
    onApply,
    onShowBlock,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** null inherits the site default. */
    value: ContentScheme | null;
    siteDefault: ContentScheme;
    getDoc: () => unknown;
    onApply: (scheme: ContentScheme | null) => Promise<{ ok: boolean }>;
    onShowBlock: (blockId: string) => void;
  } = $props();

  let draft = $state<Choice>('site');
  let saving = $state(false);
  let failed = $state(false);

  $effect(() => {
    if (open) {
      draft = value ?? 'site';
      failed = false;
    }
  });

  const schemeName: Record<ContentScheme, () => string> = {
    light: m.content_scheme_option_light,
    dark: m.content_scheme_option_dark,
    adaptive: m.content_scheme_option_adaptive,
  };
  const items = $derived([
    { value: 'site', label: m.content_scheme_option_site({ scheme: schemeName[siteDefault]() }) },
    { value: 'light', label: m.content_scheme_option_light() },
    { value: 'dark', label: m.content_scheme_option_dark() },
    { value: 'adaptive', label: m.content_scheme_option_adaptive() },
  ]);

  const resolved = $derived(resolveContentScheme({ page: draft === 'site' ? null : draft, site: siteDefault }));
  const findings = $derived<ReadinessFinding[]>(open && resolved === 'adaptive' ? checkAdaptiveReadiness(getDoc()) : []);

  function describe(f: ReadinessFinding): string {
    const block = labelFor(f.blockType);
    if (f.kind === 'html') return m.content_scheme_finding_html({ block });
    if (f.kind === 'image-ground') return m.content_scheme_finding_image({ block });
    const ground = f.scheme === 'dark' ? m.content_scheme_ground_dark() : m.content_scheme_ground_light();
    const ratio = formatNumber(f.ratio, { maximumFractionDigits: 1 });
    return f.kind === 'text' ? m.content_scheme_finding_text({ block, ratio, ground }) : m.content_scheme_finding_border({ block, ratio, ground });
  }

  function show(blockId: string) {
    onOpenChange(false);
    onShowBlock(blockId);
  }

  async function apply() {
    saving = true;
    failed = false;
    const res = await onApply(draft === 'site' ? null : draft);
    saving = false;
    if (res.ok) onOpenChange(false);
    else failed = true;
  }
</script>

<Dialog {open} {onOpenChange} title={m.content_scheme_dialog_title()} description={m.content_scheme_dialog_description()} size="md">
  <div class="body">
    <FormField label={m.content_scheme_label()} group>
      <RadioGroup items={items} value={draft} onValueChange={(v) => (draft = v as Choice)} orientation="vertical" />
    </FormField>

    {#if resolved === 'adaptive'}
      {#if findings.length === 0}
        <Alert tone="success">{m.content_scheme_ready()}</Alert>
      {:else}
        <Alert tone="warning" title={m.content_scheme_findings_title()}>{m.content_scheme_findings_intro()}</Alert>
        <ul class="findings">
          {#each findings as finding, i (i)}
            <li class="finding">
              {#if finding.kind === 'text' || finding.kind === 'border'}<span class="swatch" style:background={colorCss(finding.color)} aria-hidden="true"></span>{/if}
              <span class="text">{describe(finding)}</span>
              {#if finding.blockId}
                <Button variant="ghost" size="sm" onclick={() => show(finding.blockId!)}>{m.content_scheme_show_block()}</Button>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    {/if}

    {#if failed}<Alert tone="danger">{m.content_scheme_apply_failed()}</Alert>{/if}
  </div>

  {#snippet footer()}
    <Button variant="secondary" onclick={() => onOpenChange(false)}>{m.content_scheme_cancel()}</Button>
    <Button variant="primary" loading={saving} onclick={apply}>{m.content_scheme_apply()}</Button>
  {/snippet}
</Dialog>

<style>
  .body { display: flex; flex-direction: column; gap: var(--ds-space-md); }
  .findings { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--ds-space-sm); }
  .finding { display: flex; align-items: center; gap: var(--ds-space-sm); font-size: var(--ds-text-sm); }
  .text { flex: 1; min-width: 0; }
  .swatch {
    flex: none;
    width: 1rem;
    height: 1rem;
    border-radius: var(--ds-radius-sm);
    border: 1px solid var(--ds-color-border-strong);
  }
</style>
